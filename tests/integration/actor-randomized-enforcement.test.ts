/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and group values */
// WS-016 Named-Actor "BOUNDED_PRIOR_RANDOMIZED" — enforcement that does not depend on the owner operation behaving.
// IM-11 admission holds for a raw `store.commit` and for a TAMPERED group: a randomized establishment is lawful only as
// exactly the owner's reading of a COMMITTED Causal Draw of its own slot (the stable draw, the owner's rule, its causes as
// the inputs, lawful candidates, the exact result read and its group depended on), and once Causal Draw evidence exists
// for the slot nothing else may fill it. The two narrow ports the Causal Draw layer asks across are judged directly.
// Register lineage: IA-02, IA-03, IA-14, IA-06 (partial); RC-02, RC-07, RC-09, RC-16; IM-03, IM-07, IM-11, IM-12.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  actorCapabilityBasisKey,
  causalDrawPrecommitKey,
  causalDrawResultGroupId,
  causalDrawResultKey,
  namedActorCapabilityDrawKey,
  parseCapabilityCandidateId,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CausalDrawAdapter,
  NAMED_ACTOR_RULE,
  NamedActorAdapter,
  type CampaignStore,
  capabilityDrawDigest,
  capabilityDrawSpecification,
  namedActorRuleAuthority,
  namedActorSlotInspector,
  type DrawOutcome,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  CAP_COMMAND,
  CAP_METALWORKING,
  DRAW_OWNER_RULE_REF,
  FIXTURE_CAMPAIGN,
  FIXTURE_PC_ID,
  RESOLVER,
  SEED_1,
  actorPublication,
  capabilityBasis,
  dominantPrior,
  effectiveRules,
  historyKey,
  randomizedEstablishment,
  seededEntropy,
} from "@immortalis/testkit";
import {
  establishBasis,
  establishRandomized,
  seededActorCampaign,
  type ActorSeeded,
} from "../support/actor.ts";
import { crashBefore, isResultGroup, journalMark } from "../support/causal-draw.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const basisKey = actorCapabilityBasisKey(A, C);
const digest = capabilityDrawDigest(A, C);

type Input = ReturnType<typeof randomizedEstablishment>;
const refsOf = (s: ActorSeeded, input: Input) =>
  input.causes.map((c) => ({
    owner: c.owner,
    fact_key: c.fact_key,
    version: c.version,
    committed_by: s.campaign.store.getFact(c.fact_key)!.provenance.group_id,
  }));

/** A Causal Draw adapter wired with the Named-Actor owner's REAL ports, over any store (the owner's own wiring). */
const drawer = (s: ActorSeeded, store: CampaignStore = s.campaign.store, seed = SEED_1) =>
  new CausalDrawAdapter(store, {
    slotInspectors: new Map([["named_actor", namedActorSlotInspector(store)]]),
    ruleAuthority: namedActorRuleAuthority,
    entropy: seededEntropy(seed),
  });

/** Commits the draw of a slot exactly as the owner's operation would, without the owner's basis. */
async function commitDraw(
  s: ActorSeeded,
  input: Input = randomizedEstablishment(A, C, { prior: dominantPrior("A", ["B"]) }),
): Promise<DrawOutcome> {
  return must(
    drawer(s).draw({
      specification: capabilityDrawSpecification(input, refsOf(s, input)),
      resolution: RESOLVER,
    }),
  );
}

/** The raw group a sloppy or hostile caller might build: no registry, no adapter. */
function rawGroup(
  s: ActorSeeded,
  n: number,
  value: unknown,
  o: {
    key?: string;
    reads?: CommitGroup["reads"];
    depends_on?: string[];
    expected_version?: number;
    group_id?: string;
  } = {},
): CommitGroup {
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    group_id: o.group_id ?? `raw-group-${n}`,
    intent_id: `raw-intent-${n}`,
    owner: "named_actor",
    facet: "actor_profile",
    cause: `raw-cause-${n}`,
    rule: NAMED_ACTOR_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: o.reads ?? [],
    depends_on: o.depends_on ?? [],
    writes: [
      {
        key: o.key ?? basisKey,
        owner: "named_actor",
        facet: "actor_profile",
        value: value as never,
        unit: null,
        basis: "raw-basis",
        secrecy: "raw-secrecy",
        expected_version: o.expected_version ?? 0,
      },
    ],
  };
}

/** A lawful randomized basis value for a committed draw, and the reads/dependencies a lawful group carries. */
function lawful(s: ActorSeeded, draw: DrawOutcome, input: Input, actorId = A, capabilityId = C) {
  const result = s.campaign.store.getFact(draw.result.key)!;
  const selected = parseCapabilityCandidateId((result.value as any).selected_candidate_id);
  const value = {
    actor_id: actorId,
    capability_id: capabilityId,
    marker: selected?.marker ?? "C",
    materiality: input.materiality,
    establishment: {
      method: "BOUNDED_PRIOR_RANDOMIZED",
      causes: input.causes,
      draw: {
        draw_id: draw.draw_id,
        result: { fact_key: draw.result.key, version: draw.result.version },
      },
    },
  };
  const reads = [
    ...input.causes.map((c) => ({ key: c.fact_key, version: c.version })),
    { key: draw.result.key, version: draw.result.version },
  ];
  const depends_on = [
    ...input.causes.map((c) => s.campaign.store.getFact(c.fact_key)!.provenance.group_id),
    draw.result.group_id,
  ];
  return { value, reads, depends_on };
}

const refusal = async (s: ActorSeeded, g: CommitGroup, message?: RegExp) => {
  const mark = journalMark(s.campaign.store);
  const outcome = await s.campaign.store.commit(g);
  expect(journalMark(s.campaign.store), "nothing was written").toEqual(mark);
  if (message && !outcome.ok) expect(outcome.error.message).toMatch(message);
  return outcome.ok ? "OK" : outcome.error.code;
};

describe("IM-11 admission of a randomized establishment holds for a raw commit", () => {
  it("control: the lawful raw group over a committed draw is accepted — the helpers build what the owner builds", async () => {
    const s = await seededActorCampaign(tempDir());
    const input = randomizedEstablishment(A, C, { prior: dominantPrior("A", ["B"]) });
    const draw = await commitDraw(s, input);
    const { value, reads, depends_on } = lawful(s, draw, input);
    await must(s.campaign.store.commit(rawGroup(s, 1, value, { reads, depends_on })));
    expect(s.actors.basis(A, C)!.value.marker).toBe("A");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("without a COMMITTED draw result there is no randomized establishment: absent, or a precommit that never reached its result", async () => {
    const s = await seededActorCampaign(tempDir());
    const input = randomizedEstablishment(A, C, { prior: dominantPrior("A", ["B"]) });
    const fake = {
      draw_id: `cdraw:v1:${digest}`,
      result: { fact_key: causalDrawResultKey(digest), version: 1 },
    };
    const value = {
      actor_id: A,
      capability_id: C,
      marker: "A",
      materiality: input.materiality,
      establishment: { method: "BOUNDED_PRIOR_RANDOMIZED", causes: input.causes, draw: fake },
    };
    const pins = input.causes.map((c) => ({ key: c.fact_key, version: c.version }));
    const groups = input.causes.map(
      (c) => s.campaign.store.getFact(c.fact_key)!.provenance.group_id,
    );
    const claim = (n: number) =>
      rawGroup(s, n, value, {
        reads: [...pins, { key: fake.result.fact_key, version: 1 }],
        depends_on: [...groups, causalDrawResultGroupId(digest)],
      });
    // the commit core refuses a read of a fact that does not exist before admission is asked
    expect(await refusal(s, claim(1))).toBe("STALE_READ");
    // a committed precommit whose result never committed is still no draw result
    const crashing = drawer(s, crashBefore(s.campaign.store, isResultGroup));
    const r = await crashing.draw({
      specification: capabilityDrawSpecification(input, refsOf(s, input)),
      resolution: RESOLVER,
    });
    expect(r.ok ? "" : r.error.code).toBe("UNKNOWN_OUTCOME");
    expect(s.campaign.store.getFact(causalDrawPrecommitKey(digest))).toBeDefined();
    expect(s.campaign.store.getFact(causalDrawResultKey(digest))).toBeUndefined();
    expect(await refusal(s, claim(2))).toBe("STALE_READ");
  });

  it("the marker is exactly the owner's reading of the selected candidate: any other grade, EX or ungraded is refused", async () => {
    const s = await seededActorCampaign(tempDir());
    const input = randomizedEstablishment(A, C, { prior: dominantPrior("A", ["B"]) });
    const draw = await commitDraw(s, input);
    const { value, reads, depends_on } = lawful(s, draw, input);
    let n = 0;
    for (const marker of ["C", "B", "S", { ex: "convenient" }, null, "A-"]) {
      const code = await refusal(s, rawGroup(s, ++n, { ...value, marker }, { reads, depends_on }));
      expect(code, JSON.stringify(marker)).toBe("VALUE_INVALID");
    }
    expect(s.actors.basis(A, C)).toBeUndefined();
  });

  it("only the stable draw of THIS actor and capability can fix the slot: another slot's draw, a forged id or a wrong result pin is refused", async () => {
    const s = await seededActorCampaign(tempDir());
    const otherInput = randomizedEstablishment(A, CAP_COMMAND, {
      prior: dominantPrior("S", ["A"]),
    });
    const other = await commitDraw(s, otherInput);
    const input = randomizedEstablishment(A, C, { prior: dominantPrior("S", ["A"]) });
    const mine = await commitDraw(s, input);
    const good = lawful(s, mine, input);
    const theirs = lawful(s, other, otherInput, A, C);
    let n = 0;
    const attempt = async (
      name: string,
      value: unknown,
      reads: CommitGroup["reads"],
      depends_on: string[],
      code: string,
    ) => expect(await refusal(s, rawGroup(s, ++n, value, { reads, depends_on })), name).toBe(code);
    // another slot's committed draw, read and depended on in full
    await attempt(
      "another slot's draw",
      theirs.value,
      theirs.reads,
      theirs.depends_on,
      "VALUE_INVALID",
    );
    // a forged id for my own result
    await attempt(
      "forged id",
      {
        ...good.value,
        establishment: {
          ...good.value.establishment,
          draw: { ...good.value.establishment.draw, draw_id: `cdraw:v1:${"0".repeat(64)}` },
        },
      },
      good.reads,
      good.depends_on,
      "VALUE_INVALID",
    );
    // a result pinned at a version it does not have
    await attempt(
      "result pinned at a wrong version",
      {
        ...good.value,
        establishment: {
          ...good.value.establishment,
          draw: {
            ...good.value.establishment.draw,
            result: { fact_key: mine.result.key, version: 2 },
          },
        },
      },
      good.reads,
      good.depends_on,
      "VALUE_INVALID",
    );
    await attempt(
      "result read at a wrong version",
      good.value,
      good.reads.map((r) => (r.key === mine.result.key ? { ...r, version: 2 } : r)),
      good.depends_on,
      "STALE_READ",
    );
    // the result key of a different draw than the identity says
    await attempt(
      "result key of another draw",
      {
        ...good.value,
        establishment: {
          ...good.value.establishment,
          draw: {
            ...good.value.establishment.draw,
            result: { fact_key: other.result.key, version: 1 },
          },
        },
      },
      [...good.reads, { key: other.result.key, version: 1 }],
      [...good.depends_on, other.result.group_id],
      "VALUE_INVALID",
    );
    expect(s.actors.basis(A, C)).toBeUndefined();
  });

  it("the establishment must read the exact result and depend on its canonical group, and still pin every cause", async () => {
    const s = await seededActorCampaign(tempDir());
    const input = randomizedEstablishment(A, C, { prior: dominantPrior("A", ["B"]) });
    const draw = await commitDraw(s, input);
    const { value, reads, depends_on } = lawful(s, draw, input);
    let n = 0;
    const attempt = async (name: string, r: CommitGroup["reads"], d: string[]) =>
      expect(await refusal(s, rawGroup(s, ++n, value, { reads: r, depends_on: d })), name).toBe(
        "REFERENCE_INVALID",
      );
    await attempt(
      "result not read",
      reads.filter((r) => r.key !== draw.result.key),
      depends_on,
    );
    await attempt(
      "result group not depended on",
      reads,
      depends_on.filter((g) => g !== draw.result.group_id),
    );
    await attempt(
      "a cause not read",
      reads.filter((r) => r.key !== input.causes[0]!.fact_key),
      depends_on,
    );
    await attempt(
      "a cause's group not depended on",
      reads,
      depends_on.filter(
        (g) => g !== s.campaign.store.getFact(input.causes[0]!.fact_key)!.provenance.group_id,
      ),
    );
    expect(s.actors.basis(A, C)).toBeUndefined();
  });

  it("the prior must be the Named-Actor owner's: a draw under the slot's identity with garbage candidates, other inputs or another rule is no establishment", async () => {
    // garbage candidates and other inputs can be committed under the lawful identity by a stray caller (the neutral layer
    // checks no meaning); the owner then refuses to read them as its own establishment
    const garbage = async (
      mutate: (spec: any, s: ActorSeeded) => void,
      adapter: (s: ActorSeeded) => CausalDrawAdapter = (s) => drawer(s),
    ) => {
      const s = await seededActorCampaign(tempDir());
      const input = randomizedEstablishment(A, C, { prior: dominantPrior("A", ["B"]) });
      const spec: any = capabilityDrawSpecification(input, refsOf(s, input));
      mutate(spec, s);
      const outcome = await must(adapter(s).draw({ specification: spec, resolution: RESOLVER }));
      const { value, reads, depends_on } = lawful(s, outcome, input);
      return { s, outcome, g: rawGroup(s, 1, value, { reads, depends_on }) };
    };
    {
      const { s, g } = await garbage((spec) => {
        spec.candidates = [
          { candidate_id: "synthetic-candidate-a", weight: "1" },
          { candidate_id: "synthetic-candidate-b", weight: "1" },
        ];
      });
      // the lawful marker below is whatever the garbage selected; no reading of it can be the owner's
      expect(await refusal(s, g, /lawful possibility/)).toBe("VALUE_INVALID");
    }
    {
      const { s, g } = await garbage((spec, s) => {
        spec.input_refs = spec.input_refs.slice(1);
        void s;
      });
      expect(await refusal(s, g, /exactly the pinned causes/)).toBe("VALUE_INVALID");
    }
    {
      // a candidate that is an alternative (non-canonical) encoding of a lawful marker has no meaning either
      const { s, g } = await garbage((spec) => {
        spec.candidates[0].candidate_id = `capability-candidate:v1:${btoa('"C"')}=`;
      });
      expect(await refusal(s, g, /lawful possibility/)).toBe("VALUE_INVALID");
    }
    {
      // another rule under the slot's identity: the owner's own authority refuses to let it be created at all
      const s = await seededActorCampaign(tempDir());
      const input = randomizedEstablishment(A, C);
      const spec: any = capabilityDrawSpecification(input, refsOf(s, input));
      spec.owner_rule_ref = DRAW_OWNER_RULE_REF;
      const r = await drawer(s).draw({ specification: spec, resolution: RESOLVER });
      expect(r.ok ? "" : r.error.code).toBe("DRAW_OWNER_RULE_STALE_AT_PRECOMMIT");
      // and, with a permissive authority standing in for a stray runtime, the establishment still refuses to read it
      const permissive = new CausalDrawAdapter(s.campaign.store, {
        slotInspectors: new Map([["named_actor", namedActorSlotInspector(s.campaign.store)]]),
        ruleAuthority: effectiveRules(),
        entropy: seededEntropy(SEED_1),
      });
      const outcome = await must(permissive.draw({ specification: spec, resolution: RESOLVER }));
      const { value, reads, depends_on } = lawful(s, outcome, input);
      expect(await refusal(s, rawGroup(s, 1, value, { reads, depends_on }), /governing rule/)).toBe(
        "VALUE_INVALID",
      );
    }
  });

  it("a stray prior blocks the slot for the owner's own request (the draw is fixed by identity) — and is never read as the owner's establishment", async () => {
    const s = await seededActorCampaign(tempDir());
    const input = randomizedEstablishment(A, C);
    const spec: any = capabilityDrawSpecification(input, refsOf(s, input));
    spec.candidates = [
      { candidate_id: "stray-1", weight: "1" },
      { candidate_id: "stray-2", weight: "1" },
    ];
    await must(drawer(s).draw({ specification: spec, resolution: RESOLVER }));
    const r = await s.actors.establishRandomizedCapabilityBasis({
      ...actorPublication(1),
      capability: input,
      resolution: RESOLVER,
    });
    expect(r.ok ? "" : r.error.code).toBe("DRAW_IDENTITY_CONFLICT");
    expect(s.actors.basis(A, C)).toBeUndefined();
  });

  it("the stored form models a pointer and the marker only: no prior, weight, seed, sample, probability or unmodelled field", async () => {
    const s = await seededActorCampaign(tempDir());
    const input = randomizedEstablishment(A, C, { prior: dominantPrior("A", ["B"]) });
    const draw = await commitDraw(s, input);
    const { value, reads, depends_on } = lawful(s, draw, input);
    const withDraw = (extra: object) => ({
      ...value,
      establishment: {
        ...value.establishment,
        draw: { ...value.establishment.draw, ...extra },
      },
    });
    const variants: [string, unknown][] = [
      ["prior alongside", { ...value, establishment: { ...value.establishment, prior: [] } }],
      ["weights alongside", { ...value, establishment: { ...value.establishment, weights: {} } }],
      ["seed alongside", withDraw({ seed: "00" })],
      ["sample alongside", withDraw({ accepted_sample: "1" })],
      ["probability alongside", withDraw({ probability: 0.5 })],
      [
        "no draw",
        { ...value, establishment: { method: "BOUNDED_PRIOR_RANDOMIZED", causes: input.causes } },
      ],
      ["null draw", { ...value, establishment: { ...value.establishment, draw: null } }],
      [
        "a draw on the deterministic method",
        { ...value, establishment: { ...value.establishment, method: "CAUSALLY_DETERMINED" } },
      ],
      ["another method", { ...value, establishment: { ...value.establishment, method: "RANDOM" } }],
      ["a level", { ...value, level: 3 }],
      ["a potential", { ...value, potential: "S" }],
    ];
    let n = 0;
    for (const [name, v] of variants)
      expect(await refusal(s, rawGroup(s, ++n, v, { reads, depends_on })), name).toBe(
        "VALUE_INVALID",
      );
    expect(s.actors.basis(A, C)).toBeUndefined();
  });

  it("the boundary holds as for any establishment: a Player Character identity cannot be given a drawn capability", async () => {
    const s = await seededActorCampaign(tempDir());
    const input = randomizedEstablishment(FIXTURE_PC_ID, C, { prior: dominantPrior("A", ["B"]) }, [
      `${A}-biography`,
    ]);
    // the raw layer happily draws for any slot shape the owner's authority accepts…
    const draw = await commitDraw(s, input);
    const { value, reads, depends_on } = lawful(s, draw, input, FIXTURE_PC_ID, C);
    // …but the owner never writes for a PC
    expect(
      await refusal(
        s,
        rawGroup(s, 1, value, {
          key: actorCapabilityBasisKey(FIXTURE_PC_ID, C),
          reads,
          depends_on,
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
  });

  it("Causal Draw provenance is engine-internal evidence, never a cause of a mastery — on either path", async () => {
    const s = await seededActorCampaign(tempDir());
    await commitDraw(s);
    const precommit = s.campaign.store.getFact(causalDrawPrecommitKey(digest))!;
    const cause = {
      aspect: "BIOGRAPHY_HISTORY",
      owner: "causal_draw_kernel",
      fact_key: precommit.key,
      version: precommit.version,
    };
    const deterministic = {
      actor_id: A,
      capability_id: CAP_COMMAND,
      marker: "S",
      materiality: "ROLE_DEFINING",
      establishment: { method: "CAUSALLY_DETERMINED", causes: [cause] },
    };
    expect(
      await refusal(
        s,
        rawGroup(s, 1, deterministic, {
          key: actorCapabilityBasisKey(A, CAP_COMMAND),
          reads: [{ key: precommit.key, version: precommit.version }],
          depends_on: [precommit.provenance.group_id],
        }),
      ),
    ).toBe("REFERENCE_INVALID");
  });

  it("the randomized establishment is create-only like every basis: no overwrite, no second establishment", async () => {
    const s = await seededActorCampaign(tempDir());
    const input = randomizedEstablishment(A, C, { prior: dominantPrior("A", ["B"]) });
    const basis = await establishRandomized(s, 1, { prior: input.prior });
    const mine = s.campaign.store.getFact(causalDrawResultKey(digest))!;
    const { value, reads, depends_on } = lawful(
      s,
      {
        draw_id: `cdraw:v1:${digest}`,
        result: { key: mine.key, version: mine.version, group_id: mine.provenance.group_id },
      } as DrawOutcome,
      input,
    );
    expect(basis.marker).toBe("A");
    // an overwrite at the current version, even with the same content, and a second creation
    const current = s.campaign.store.getFact(basisKey)!.version;
    expect(
      await refusal(s, rawGroup(s, 1, value, { reads, depends_on, expected_version: current })),
    ).not.toBe("OK");
    expect(await refusal(s, rawGroup(s, 2, value, { reads, depends_on }))).not.toBe("OK");
    expect(s.actors.basis(A, C)!.fact.version).toBe(1);
  });
});

describe("once Causal Draw evidence exists for a slot, nothing but the establishment that reads it may fill the slot", () => {
  const interrupted = async (stage: "precommit" | "result") => {
    const s = await seededActorCampaign(tempDir());
    const input = randomizedEstablishment(A, C, { prior: dominantPrior("A", ["B"]) });
    if (stage === "result") {
      await commitDraw(s, input);
    } else {
      const crashing = drawer(s, crashBefore(s.campaign.store, isResultGroup));
      const r = await crashing.draw({
        specification: capabilityDrawSpecification(input, refsOf(s, input)),
        resolution: RESOLVER,
      });
      expect(r.ok ? "" : r.error.code).toBe("UNKNOWN_OUTCOME");
    }
    return { s, input };
  };

  for (const stage of ["precommit", "result"] as const) {
    it(`a deterministic basis cannot sidestep a committed ${stage} — through the owner's path or a raw commit`, async () => {
      const { s } = await interrupted(stage);
      const mark = journalMark(s.campaign.store);
      const viaOwner = await s.actors.establishCapabilityBasis({
        ...actorPublication(1),
        capability: capabilityBasis(A, C, { marker: "S" }),
      });
      expect(viaOwner.ok ? "" : viaOwner.error.code).toBe("REFERENCE_INVALID");
      expect(journalMark(s.campaign.store)).toEqual(mark);
      expect(s.actors.basis(A, C)).toBeUndefined();
    });

    it(`the owner's randomized request after a committed ${stage} converges on that same draw: no new seed, one establishment`, async () => {
      const { s, input } = await interrupted(stage);
      const seed = (s.campaign.store.getFact(causalDrawPrecommitKey(digest))!.value as any)
        .entropy_hex;
      const entropy = seededEntropy("ff".repeat(32));
      const adapter = new NamedActorAdapter(s.campaign.store, { entropy });
      // the crashing adapter poisoned only its own wrapper store: this store's guard is untouched
      await must(
        adapter.establishRandomizedCapabilityBasis({
          ...actorPublication(1),
          capability: input,
          resolution: RESOLVER,
        }),
      );
      expect(entropy.calls()).toBe(0);
      expect(
        (s.campaign.store.getFact(causalDrawPrecommitKey(digest))!.value as any).entropy_hex,
      ).toBe(seed);
      expect(s.actors.basis(A, C)!.value.marker).toBe("A");
      expect(s.campaign.verify()).toEqual([]);
    });
  }

  it("a draw that finds the slot independently established is refused and never samples; an unrelated slot shape is nobody's draw", async () => {
    const s = await seededActorCampaign(tempDir());
    await establishBasis(s, 1);
    const input = randomizedEstablishment(A, C);
    const r = await drawer(s).draw({
      specification: capabilityDrawSpecification(input, refsOf(s, input)),
      resolution: RESOLVER,
    });
    expect(r.ok ? "" : r.error.code).toBe("DRAW_NOT_REQUIRED_ALREADY_ESTABLISHED");
    // a draw under the Named-Actor owner for something that is no establishment slot cannot even be created
    const spec: any = capabilityDrawSpecification(input, refsOf(s, input));
    spec.draw_key.prospective_result_id = `actor/${A}/capability/${C}`;
    const stray = await drawer(s).draw({ specification: spec, resolution: RESOLVER });
    expect(stray.ok ? "" : stray.error.code).toBe("DRAW_OWNER_RULE_STALE_AT_PRECOMMIT");
  });
});

describe("the two narrow ports the Causal Draw layer asks across", () => {
  it("the slot inspector reports only a Named-Actor establishment slot, by identity, and judges nothing about linkage", async () => {
    const s = await seededActorCampaign(tempDir());
    const inspector = namedActorSlotInspector(s.campaign.store);
    const key = namedActorCapabilityDrawKey(A, C);
    const ask = (over: Partial<typeof key> = {}) => {
      const k = { ...key, ...over };
      return inspector.inspectResultSlot({
        owner_operation: k.owner_operation,
        prospective_result_id: k.prospective_result_id,
      });
    };
    expect(ask()).toEqual({ established: false });
    const basis = await establishBasis(s, 1);
    expect(basis.actor_id).toBe(A);
    expect(ask()).toEqual({
      established: true,
      establishing_intent_id: s.actors.basis(A, C)!.fact.provenance.intent_id,
    });
    // another owner's operation, or a key that is no establishment slot (the capability itself, a history fact), is not
    // established by this owner whatever else is committed
    expect(
      ask({ owner_operation: { owner: "other-owner", operation: key.owner_operation.operation } }),
    ).toEqual({
      established: false,
    });
    for (const id of [`actor/${A}/capability/${C}`, historyKey(`${A}-biography`), "not-a-key"]) {
      expect(ask({ prospective_result_id: id }), id).toEqual({ established: false });
    }
  });

  it("the rule authority makes a prior effective only under the Named-Actor rule, for the stable draw of an establishment slot", () => {
    const key = namedActorCapabilityDrawKey(A, C);
    const ok = (rule = NAMED_ACTOR_RULE, k: any = key) =>
      namedActorRuleAuthority.isEffectiveForPriorCreation(rule, k);
    expect(ok()).toBe(true);
    expect(ok(DRAW_OWNER_RULE_REF)).toBe(false);
    expect(ok({ ...NAMED_ACTOR_RULE, native_pin: "2026-09-24T17:38:59.211Z" })).toBe(false);
    expect(
      ok(NAMED_ACTOR_RULE, { ...key, owner_operation: { ...key.owner_operation, owner: "x" } }),
    ).toBe(false);
    expect(
      ok(NAMED_ACTOR_RULE, { ...key, owner_operation: { ...key.owner_operation, operation: "x" } }),
    ).toBe(false);
    expect(ok(NAMED_ACTOR_RULE, { ...key, opportunity_id: "retry-2" })).toBe(false);
    expect(ok(NAMED_ACTOR_RULE, { ...key, causal_process_id: "elsewhere" })).toBe(false);
    expect(
      ok(NAMED_ACTOR_RULE, { ...key, prospective_result_id: `actor/${A}/capability/${C}` }),
    ).toBe(false);
    expect(ok(NAMED_ACTOR_RULE, { ...key, prospective_result_id: "x" })).toBe(false);
    // a process id that names another slot than the result slot is not the stable draw of either
    expect(
      ok(NAMED_ACTOR_RULE, { ...key, causal_process_id: `actor-capability/${A}/${CAP_COMMAND}` }),
    ).toBe(false);
  });
});
