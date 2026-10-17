/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and forge raw groups */
// R-5 (NEWLY AUTHORIZED; BLUE repair handoff v1; independent review pending) — the PROSPECTIVE collection clarification, ENGINE level. The
// starting shape is the live one: an already released and bound ordinary character whose accepted claims say the hands gather material
// and state NO duration for one handling cycle. These tests prove what the engine enforces (admission, load verification, the consumers);
// the referee is the scripted policy (PLUMBING ONLY: nothing here shows that an AI understood any sentence), and no row is a player's choice.
import { describe, expect, it } from "vitest";
import {
  CanonicalCampaign,
  PC_INTRINSIC_CLARIFICATION_RULE,
  pcClarificationIdOf,
  pcClarificationViolation,
} from "@immortalis/engine";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  TEMPORAL_STATE_KEY,
  pcExistenceContractKey,
  pcIntrinsicClarificationKey,
  PcIntrinsicClarificationSchema,
  worldPcLocusCustodyKey,
  type CommitGroup,
} from "@immortalis/contracts";
import { ACTOR_FIXTURE_EXTENSION } from "@immortalis/testkit";
import { rogueReplay } from "../support/existing-actor.ts";
import {
  ACT_A,
  MECH,
  PC,
  T0,
  collectionCampaign,
  colPublication,
  confirmAndStart,
  reserveAmount,
  sourceRemaining,
} from "../support/pc-collection.ts";
import {
  CLAR_TAU,
  NO_CYCLE_CLAIM,
  clarWords,
  clarificationGroup,
  clarifiedCycleAnswer,
  mechanismInput,
  retain,
} from "../support/pc-clarification.ts";
import { advanceTo } from "../support/pc-lapse.ts";
import { tempDir } from "../support/tmp.ts";

const WORDS = [clarWords()];
const ID = pcClarificationIdOf(PC);
const KEY = pcIntrinsicClarificationKey(PC, ID);

/** the live starting shape: bound, custodied, clock established, source and Reserve present, NO stated cycle and no mechanism */
const startingShape = (dir = tempDir("immortalis-clarify-")) =>
  collectionCampaign({ dir, claimStatement: NO_CYCLE_CLAIM, noMechanism: true });

const clarify = (s: Awaited<ReturnType<typeof startingShape>>, refereeKey: string, n = 7001) =>
  s.collect.clarify({
    ...colPublication(n),
    pc_id: PC,
    statements: WORDS,
    referee_key: refereeKey,
  });

/**
 * BLUE H-3: the preservation oracle reads the CANONICAL keys, requires every record to exist (an absent record would compare
 * equal to itself and prove nothing), and compares the actual committed values.
 */
const snapshot = (s: Awaited<ReturnType<typeof startingShape>>) => {
  const raw = (key: string) => {
    const fact = s.campaign.store.getFact(key);
    expect(fact, `the preserved record ${key} exists`).toBeDefined();
    return JSON.stringify(fact);
  };
  const source = sourceRemaining(s);
  const reserve = reserveAmount(s);
  expect(source).toBeDefined();
  expect(reserve).toBeDefined();
  return {
    contract: raw(pcExistenceContractKey(PC)),
    binding: raw(PLAYER_CHARACTER_BINDING_KEY),
    custody: raw(worldPcLocusCustodyKey(PC)),
    clock: raw(TEMPORAL_STATE_KEY),
    source,
    reserve,
  };
};

describe("R-5 the starting shape: before the clarification no exact cycle can be prepared", () => {
  it("no quotation of the released claims states a cycle, an invented quotation is refused, and a mechanism citing a clarification that does not exist is refused", async () => {
    const s = await startingShape();
    try {
      const mech = (over: Record<string, unknown>) =>
        s.collect.establishMechanism({
          ...colPublication(7100),
          mechanism: {
            pc_id: PC,
            mechanism_id: MECH,
            claims: [{ section: "embodiment_topology", index: 0 }],
            actuator: { statement: "the hands of this body gather loose material by hand" },
            traversal: { statement: "these hands cannot pass a sealed barrier" },
            cycle_duration: { unit: T0.unit, value: CLAR_TAU },
            cycle_quote: clarWords(),
            ...over,
          },
        });
      expect((await mech({})).ok).toBe(false); // the words are not in any accepted claim
      expect((await mech({ cycle_quote: "gather loose material by hand" })).ok).toBe(false); // states no number
      const cited = await s.collect.establishMechanism({
        ...colPublication(7101),
        mechanism: mechanismInput(ID),
      });
      expect(cited.ok).toBe(false); // the clarification is not committed
    } finally {
      await s.campaign.close();
    }
  }, 120_000);
});

describe("R-5 the lawful path: classification → clarification → mechanism → attestation, nothing else moves", () => {
  it("the SAME character prepares and attests its cycle from the accepted premise; the released contract, the binding, the clock, the source and the Reserve are untouched; a fresh open verifies", async () => {
    const dir = tempDir("immortalis-clarify-lawful-");
    const s = await startingShape(dir);
    const before = snapshot(s);
    const keysBefore = new Set(s.campaign.store.listFacts().map((f) => f.key));
    const recorded = await retain(s.campaign, WORDS);
    expect(recorded.ok).toBe(true);
    const refereeKey = (recorded as any).value.record.key as string;
    const done = await clarify(s, refereeKey);
    expect(done.ok, JSON.stringify((done as any).error)).toBe(true);

    const held = s.collect.clarification(PC, ID)!;
    expect(held.value.claims).toEqual([{ statement: WORDS[0], provenance: "PLAYER-AUTHORED" }]);
    expect(held.value.interpreted_by).toEqual({
      role: "role.gm",
      permission: "permission.rule.adjudicate",
    });
    expect(held.value.accepted_by).toEqual({
      role: "role.archivist",
      permission: "permission.canon.write",
    });
    expect(held.value.effective_from).toEqual(T0);
    // presenting it again reconciles by identity: the same receipt, nothing new
    const head = s.campaign.store.head().state_sha256;
    expect((await clarify(s, refereeKey)).ok).toBe(true);
    expect(s.campaign.store.head().state_sha256).toBe(head);

    // the mechanism follows the accepted clarified claim; the attestation follows it too
    const mech = await s.collect.establishMechanism({
      ...colPublication(7010),
      mechanism: mechanismInput(ID),
    });
    expect(mech.ok, JSON.stringify((mech as any).error)).toBe(true);
    const task = s.collect.cycleTask(PC, MECH)!;
    expect(task.clarified).toEqual([
      {
        ref: { clarification: { fact_key: KEY, version: 1 }, index: 0 },
        statement: WORDS[0],
      },
    ]);
    const attested = await s.collect.attestCycle({
      pc_id: PC,
      mechanism_id: MECH,
      answer: clarifiedCycleAnswer(task),
    });
    expect(attested.ok, JSON.stringify((attested as any).error)).toBe(true);
    expect(s.collect.attestation(PC, MECH)!.value.clarified).toEqual(
      s.collect.mechanism(PC, MECH)!.value.authored_from.clarified,
    );

    // nothing else moved: sealed record, binding, clock, material
    expect(snapshot(s)).toEqual(before);
    const added = s.campaign.store
      .listFacts()
      .map((f) => f.key)
      .filter((k) => !keysBefore.has(k))
      .sort();
    expect(added).toEqual(
      [
        KEY,
        refereeKey,
        `pc/${PC}/collection-mechanism/${MECH}`,
        `pc/${PC}/collection-attestation/${MECH}`,
      ].sort(),
    );
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();

    // a fresh, ordinary-registry open re-verifies it all
    const reopened = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
    expect(reopened.ok).toBe(true);
    if (reopened.ok) {
      expect(reopened.value.verify()).toEqual([]);
      await reopened.value.close();
    }
  }, 240_000);
});

describe("R-5 falsifiers: the clarification itself", () => {
  it("is refused without a retained classification, or with one over other words, one that is not CLOSED, or one that is not an I-002 decision", async () => {
    const s = await startingShape();
    try {
      // no retained classification of any kind
      expect((await clarify(s, "referee/" + "0".repeat(64) + "/decision")).ok).toBe(false);
      // a classification of OTHER words
      const other = await retain(s.campaign, [
        "It takes me 3 second to lift and carry one handful",
      ]);
      expect(other.ok).toBe(true);
      expect((await clarify(s, (other as any).value.record.key, 7002)).ok).toBe(false);
      // a classification that is not CLOSED: the host reads the words as a claim about the world
      const blocked = await retain(s.campaign, WORDS, [
        { match: /handful/, class: "WORLD_STATE_ASSERTION" },
      ]);
      expect(blocked.ok).toBe(true);
      expect((blocked as any).value.verdict).not.toBe("CLOSED");
      expect((await clarify(s, (blocked as any).value.record.key, 7003)).ok).toBe(false);
      // a decision that is not an I-002 classification (a fact that is not a referee decision at all)
      expect((await clarify(s, `pc/${PC}/existence-contract`, 7004)).ok).toBe(false);
      expect(s.collect.clarification(PC, ID)).toBeUndefined();
    } finally {
      await s.campaign.close();
    }
  }, 180_000);

  it("is refused for a forged acceptance, a retroactive or future effective time, a stale pin, another rule, another character, a second write and bad words", async () => {
    const s = await startingShape();
    try {
      const recorded = await retain(s.campaign, WORDS);
      const refereeKey = (recorded as any).value.record.key as string;
      const commit = (g: CommitGroup) => s.campaign.store.commit(g);
      const forged = (n: number, f: (v: any) => void) =>
        commit(clarificationGroup(s.campaign, WORDS, refereeKey, n, { value: f }));
      // the control: the lawful group commits
      const lawful = clarificationGroup(s.campaign, WORDS, refereeKey, 7010);
      expect(PcIntrinsicClarificationSchema.safeParse(lawful.writes[0]!.value).success).toBe(true);
      // forged acceptance: the player (or the host) is not the archivist
      expect(
        (await forged(7011, (v) => (v.accepted_by = { role: "role.player", permission: "x" }))).ok,
      ).toBe(false);
      expect(
        (
          await forged(
            7012,
            (v) =>
              (v.interpreted_by = {
                role: "role.player",
                permission: "permission.rule.adjudicate",
              }),
          )
        ).ok,
      ).toBe(false);
      // retroactive and future effective times
      expect(
        (await forged(7013, (v) => (v.effective_from = { ...v.effective_from, value: 0 }))).ok,
      ).toBe(false);
      expect(
        (await forged(7014, (v) => (v.effective_from = { ...v.effective_from, value: 10_000 }))).ok,
      ).toBe(false);
      // stale pins
      expect((await forged(7015, (v) => (v.contract.version += 1))).ok).toBe(false);
      expect((await forged(7016, (v) => (v.binding.version += 1))).ok).toBe(false);
      expect((await forged(7017, (v) => (v.referee.version += 1))).ok).toBe(false);
      // another character: the identity and the slot follow the character
      expect((await forged(7018, (v) => (v.pc_id = "pc-someone-else"))).ok).toBe(false);
      // words a different invocation cannot carry
      expect((await forged(7019, (v) => (v.invocation.branch = "SOMETHING_ELSE"))).ok).toBe(false);
      // another governing rule
      expect(
        (
          await commit(
            clarificationGroup(s.campaign, WORDS, refereeKey, 7020, {
              group: { rule: { ...PC_INTRINSIC_CLARIFICATION_RULE, clause: "the plain rule" } },
            }),
          )
        ).ok,
      ).toBe(false);
      // none of the above wrote anything
      expect(s.campaign.store.getFact(KEY)).toBeUndefined();
      // the lawful one commits, and a second write to the same slot is refused (SEALED, create-only)
      expect((await commit(lawful)).ok).toBe(true);
      const again = clarificationGroup(s.campaign, WORDS, refereeKey, 7021);
      expect(
        (await commit({ ...again, writes: [{ ...again.writes[0]!, expected_version: 1 }] })).ok,
      ).toBe(false);
      expect(s.campaign.store.getFact(KEY)!.version).toBe(1);
      expect(s.campaign.verify()).toEqual([]);
    } finally {
      await s.campaign.close();
    }
  }, 240_000);

  it("is refused for bounded-text violations", async () => {
    const s = await startingShape();
    try {
      for (const bad of ["x".repeat(501) + " 9 second", "nine second\u0007 9", ""]) {
        const r = await retain(s.campaign, [bad]);
        if (!r.ok) continue; // a classification cannot even be retained for an empty statement
        const done = await s.collect.clarify({
          ...colPublication(7030),
          pc_id: PC,
          statements: [bad],
          referee_key: (r as any).value.record.key,
        });
        expect(done.ok).toBe(false);
      }
    } finally {
      await s.campaign.close();
    }
  }, 120_000);

  it("is refused once a collection commitment of the character exists: the clarification is prospective and retrofits no act", async () => {
    const dir = tempDir("immortalis-clarify-late-");
    const s = await collectionCampaign({ dir });
    try {
      const started = await confirmAndStart(s, ACT_A, 3);
      expect(started.committed.ok).toBe(true);
      const recorded = await retain(s.campaign, WORDS);
      const refereeKey = (recorded as any).value.record.key as string;
      const late = await s.collect.clarify({
        ...colPublication(7040),
        pc_id: PC,
        statements: WORDS,
        referee_key: refereeKey,
      });
      expect(late.ok).toBe(false);
      expect(s.collect.clarification(PC, ID)).toBeUndefined();
      // and the violation is the dependent-commitment rule, judged on the committed facts
      const why = pcClarificationViolation(
        KEY,
        PcIntrinsicClarificationSchema.parse(
          clarificationGroup(s.campaign, WORDS, refereeKey, 7041).writes[0]!.value,
        ),
        new Map(s.campaign.store.listFacts().map((f) => [f.key, f])),
      );
      expect(why).toMatch(/dependent collection commitment/);
    } finally {
      await s.campaign.close();
    }
  }, 240_000);
});

describe("R-5 falsifiers: the consumers (mechanism and attestation) follow only the lawful current premise", () => {
  const prepared = async () => {
    const s = await startingShape();
    const recorded = await retain(s.campaign, WORDS);
    const refereeKey = (recorded as any).value.record.key as string;
    expect((await clarify(s, refereeKey)).ok).toBe(true);
    return s;
  };
  const mech = (s: Awaited<ReturnType<typeof startingShape>>, input: any, n = 7050) =>
    s.collect.establishMechanism({ ...colPublication(n), mechanism: input });

  it("refuses a quotation that is not in the clarified claim, a number the words do not state, a unit they do not state, a wrong index and a stale pin", async () => {
    const s = await prepared();
    try {
      expect(
        (await mech(s, mechanismInput(ID, { cycle_quote: "It takes me 12 second to carry" }))).ok,
      ).toBe(false);
      expect(
        (
          await mech(
            s,
            mechanismInput(ID, { cycle_duration: { unit: T0.unit, value: CLAR_TAU + 1 } }),
            7051,
          )
        ).ok,
      ).toBe(false);
      expect(
        (
          await mech(
            s,
            mechanismInput(ID, { cycle_duration: { unit: "minute", value: CLAR_TAU } }),
            7052,
          )
        ).ok,
      ).toBe(false);
      expect(
        (
          await mech(
            s,
            mechanismInput(ID, { clarified: [{ clarification_id: ID, index: 1 }] }),
            7053,
          )
        ).ok,
      ).toBe(false);
      expect(
        (
          await mech(
            s,
            mechanismInput(ID, {
              clarified: [{ clarification_id: "clarification-0000000000000000", index: 0 }],
            }),
            7054,
          )
        ).ok,
      ).toBe(false);
      expect(s.collect.mechanism(PC, MECH)).toBeUndefined();
      // control: the lawful mechanism
      expect((await mech(s, mechanismInput(ID), 7055)).ok).toBe(true);
    } finally {
      await s.campaign.close();
    }
  }, 240_000);

  it("refuses an attestation whose grounds are not quotations of the delivered claims, and one that reads the content as something else", async () => {
    const s = await prepared();
    try {
      expect((await mech(s, mechanismInput(ID))).ok).toBe(true);
      const task = s.collect.cycleTask(PC, MECH)!;
      const attest = (answer: unknown) =>
        s.collect.attestCycle({ pc_id: PC, mechanism_id: MECH, answer });
      expect(
        (await attest(clarifiedCycleAnswer(task, { cycle_ground: "It takes me 8 second" }))).ok,
      ).toBe(false);
      expect(
        (await attest(clarifiedCycleAnswer(task, { reading: "NOT_ONE_UNIT_ONE_SERIAL_CYCLE" }))).ok,
      ).toBe(false);
      expect(
        (await attest(clarifiedCycleAnswer(task, { grounds: ["a sentence nobody delivered"] }))).ok,
      ).toBe(false);
      expect(s.collect.attestation(PC, MECH)).toBeUndefined();
      expect((await attest(clarifiedCycleAnswer(task))).ok).toBe(true);
    } finally {
      await s.campaign.close();
    }
  }, 240_000);
});

describe("R-5 load verification: a history built OUTSIDE admission is refused by the verifier", () => {
  const codes = async (d: string): Promise<string> => {
    const r = await CanonicalCampaign.open(d, { extension: ACTOR_FIXTURE_EXTENSION });
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
      : r.error.code;
  };
  const edit =
    (f: (v: any) => void) =>
    (g: CommitGroup): CommitGroup =>
      g.writes.some((w) => w.key === KEY)
        ? {
            ...g,
            writes: g.writes.map((w) => {
              if (w.key !== KEY) return w;
              const v = structuredClone(w.value) as any;
              f(v);
              return { ...w, value: v };
            }),
          }
        : g;

  it("a replay of the lawful journals (clarified only; and with mechanism and attestation) opens", async () => {
    const dir = tempDir("immortalis-clarify-rogue-full-");
    const s = await startingShape(dir);
    const recorded = await retain(s.campaign, WORDS);
    expect((await clarify(s, (recorded as any).value.record.key)).ok).toBe(true);
    await s.campaign.close();
    expect(await codes(await rogueReplay(dir))).toBe("OK");
    const full = tempDir("immortalis-clarify-rogue-mech-");
    const f = await startingShape(full);
    const r2 = await retain(f.campaign, WORDS);
    expect((await clarify(f, (r2 as any).value.record.key)).ok).toBe(true);
    expect(
      (
        await f.collect.establishMechanism({
          ...colPublication(7060),
          mechanism: mechanismInput(ID),
        })
      ).ok,
    ).toBe(true);
    const task = f.collect.cycleTask(PC, MECH)!;
    expect(
      (
        await f.collect.attestCycle({
          pc_id: PC,
          mechanism_id: MECH,
          answer: clarifiedCycleAnswer(task),
        })
      ).ok,
    ).toBe(true);
    await f.campaign.close();
    expect(await codes(await rogueReplay(full))).toBe("OK");
  }, 480_000);

  it("altered words, stale pins, a later effective time, another rule and a dropped classification are each refused by the clarification's own verifier", async () => {
    const dir = tempDir("immortalis-clarify-rogue-");
    const s = await startingShape(dir);
    const recorded = await retain(s.campaign, WORDS);
    const refereeKey = (recorded as any).value.record.key as string;
    expect((await clarify(s, refereeKey)).ok).toBe(true);
    await s.campaign.close();
    const cases: Record<string, (g: CommitGroup) => CommitGroup | null> = {
      "other words than the classification covered": edit(
        (v) => (v.claims[0].statement = "It takes me 1 second to lift and carry one handful"),
      ),
      "a stale contract pin": edit((v) => (v.contract.version += 1)),
      "a stale binding pin": edit((v) => (v.binding.version += 1)),
      "an effective time later than the clock": edit((v) => (v.effective_from.value += 1000)),
      "another governing rule": (g) =>
        g.writes.some((w) => w.key === KEY)
          ? { ...g, rule: { ...g.rule, clause: "the plain rule" } }
          : g,
    };
    for (const [name, mutate] of Object.entries(cases)) {
      expect(await codes(await rogueReplay(dir, mutate)), name).not.toBe("OK");
    }
  }, 480_000);

  it("a clarification committed AFTER a collection commitment of its character (outside admission) is refused: it would retrofit an act", async () => {
    const dir = tempDir("immortalis-clarify-rogue-late-");
    const s = await collectionCampaign({ dir });
    expect((await confirmAndStart(s, ACT_A, 3)).committed.ok).toBe(true);
    await s.campaign.close();
    const late = await rogueReplay(
      dir,
      (g) => g,
      async (store) => {
        const recorded = await retain({ store }, WORDS);
        expect(recorded.ok).toBe(true);
        const group = clarificationGroup(
          { store },
          WORDS,
          (recorded as any).value.record.key,
          7099,
        );
        const committed = await store.commit(group);
        expect(committed.ok).toBe(true);
      },
    );
    expect(await codes(late)).not.toBe("OK");
  }, 480_000);
});

const clarifyWith = (
  s: Awaited<ReturnType<typeof startingShape>>,
  statements: readonly string[],
  refereeKey: string,
  n: number,
) =>
  s.collect.clarify({
    ...colPublication(n),
    pc_id: PC,
    statements,
    referee_key: refereeKey,
  });
const keyOf = (r: unknown): string => (r as any).value.record.key as string;

describe("R-5 BLUE H-1: the interpretation is bound to the accepted baseline, the precise branch and any prior closure", () => {
  const COMPOUND = `It takes me ${CLAR_TAU} ${T0.unit} to lift and carry one handful, and my third arm can carry a whole cart`;

  it("the first compatible closure succeeds, and the retained record carries the exact scope the owner derives", async () => {
    const s = await startingShape();
    try {
      const scope = s.collect.clarificationScope(PC)!;
      expect(scope.prior_closures).toEqual([]);
      expect(scope.baseline.map((b) => b.text).join("\n")).toContain(NO_CYCLE_CLAIM.slice(0, 20));
      const r = await retain(s.campaign, WORDS);
      expect(r.ok).toBe(true);
      const record = s.campaign.store.getFact(keyOf(r))!.value as any;
      expect(record.input.clarification).toEqual(scope);
      expect(record.decision.clarification.branch).toBe("UNRESOLVED_BEFORE");
      expect(record.decision.clarification.scope).toBe(
        "ONLY_THE_DURATION_OF_THE_EXISTING_ACTUATOR_CYCLE",
      );
      expect((await clarify(s, keyOf(r))).ok).toBe(true);
    } finally {
      await s.campaign.close();
    }
  }, 120_000);

  it("an identical replay writes nothing; a conflicting second definition is refused and the first stands", async () => {
    const s = await startingShape();
    try {
      const r = await retain(s.campaign, WORDS);
      expect((await clarify(s, keyOf(r))).ok).toBe(true);
      const head = s.campaign.store.head().state_sha256;
      expect((await clarify(s, keyOf(r))).ok).toBe(true); // the same presentation reconciles by identity
      // a fresh presentation of even the same words finds the one slot taken: create-only, nothing is written
      expect((await clarify(s, keyOf(r), 7101)).ok).toBe(false);
      expect(s.campaign.store.head().state_sha256).toBe(head);

      // a second, different rate: the one slot is taken, whatever the host would say
      const other = [clarWords(CLAR_TAU + 4)];
      const r2 = await retain(s.campaign, other);
      const conflicted = await clarifyWith(s, other, keyOf(r2), 7102);
      expect(conflicted.ok).toBe(false);
      // and the scope a host is delivered afterwards names the earlier closure
      expect(s.collect.clarificationScope(PC)!.prior_closures).toEqual([
        { clarification_id: ID, statements: WORDS },
      ]);
      expect(s.collect.clarification(PC, ID)!.value.claims[0]!.statement).toBe(WORDS[0]);
      expect(s.campaign.store.getFact(KEY)!.version).toBe(1);
      expect(s.campaign.verify()).toEqual([]);
    } finally {
      await s.campaign.close();
    }
  }, 180_000);

  it("a compound statement that adds an actuator or a power is not CLOSED whatever else it states, and is refused", async () => {
    const s = await startingShape();
    try {
      const r = await retain(s.campaign, [COMPOUND], [], 0, PC, {
        clarify: { adds: /third arm/ },
      });
      expect(r.ok).toBe(true);
      expect((r as any).value.verdict).not.toBe("CLOSED");
      expect((await clarifyWith(s, [COMPOUND], keyOf(r), 7110)).ok).toBe(false);
      expect(s.collect.clarification(PC, ID)).toBeUndefined();
    } finally {
      await s.campaign.close();
    }
  }, 120_000);

  it("words the baseline already states, or that contradict a prior closure, are not CLOSED", async () => {
    const s = await startingShape();
    try {
      for (const [attempt, branch] of (
        ["ALREADY_STATED_IN_BASELINE", "CONTRADICTS_PRIOR_CLOSURE"] as const
      ).entries()) {
        const r = await retain(s.campaign, WORDS, [], attempt, PC, { clarify: { branch } });
        expect((r as any).value.verdict).not.toBe("CLOSED");
        expect((await clarify(s, keyOf(r), 7120 + branch.length)).ok).toBe(false);
      }
      expect(s.collect.clarification(PC, ID)).toBeUndefined();
    } finally {
      await s.campaign.close();
    }
  }, 120_000);

  it("a legacy classification with no scope, and one over another baseline or a falsified prior closure, does not qualify", async () => {
    const s = await startingShape();
    try {
      const legacy = await retain(s.campaign, WORDS, [], 0, PC, { unscoped: true });
      expect(legacy.ok).toBe(true);
      expect((await clarify(s, keyOf(legacy), 7130)).ok).toBe(false);

      const real = s.collect.clarificationScope(PC)!;
      const elsewhere = await retain(s.campaign, WORDS, [], 0, PC, {
        scope: {
          ...real,
          baseline: real.baseline.map((b, i) =>
            i === 0 ? { ...b, text: `${b.text}; and a flying carpet` } : b,
          ),
        },
      });
      expect(elsewhere.ok).toBe(true);
      expect((await clarify(s, keyOf(elsewhere), 7131)).ok).toBe(false);

      const claimed = await retain(s.campaign, WORDS, [], 0, PC, {
        scope: {
          ...real,
          prior_closures: [
            { clarification_id: "clarification-0000000000000000", statements: ["x 1"] },
          ],
        },
      });
      expect(claimed.ok).toBe(true);
      expect((await clarify(s, keyOf(claimed), 7132)).ok).toBe(false);

      expect(s.collect.clarification(PC, ID)).toBeUndefined();
    } finally {
      await s.campaign.close();
    }
  }, 180_000);

  it("a clarification can never ground the actuator or the traversal of a mechanism, even if a host misread a compound statement as compatible", async () => {
    const s = await startingShape();
    try {
      // PLUMBING: a host that wrongly reads the compound words as only a duration (the engine cannot read minds)
      const r = await retain(s.campaign, [COMPOUND]);
      expect(r.ok).toBe(true);
      expect((await clarifyWith(s, [COMPOUND], keyOf(r), 7140)).ok).toBe(true);
      const mech = (over: Record<string, unknown>, n: number) =>
        s.collect.establishMechanism({
          ...colPublication(n),
          mechanism: mechanismInput(ID, {
            cycle_quote: COMPOUND.slice(0, 50),
            ...over,
          }),
        });
      expect(
        (await mech({ actuator: { statement: "my third arm can carry a whole cart" } }, 7141)).ok,
      ).toBe(false);
      expect(
        (await mech({ traversal: { statement: "my third arm can carry a whole cart" } }, 7142)).ok,
      ).toBe(false);
      expect(s.collect.mechanism(PC, MECH)).toBeUndefined();
    } finally {
      await s.campaign.close();
    }
  }, 180_000);
});

describe("R-5 BLUE H-2: the acceptance time is witnessed by the Temporal owner's own sealed history, immutably", () => {
  const codes = async (d: string): Promise<string> => {
    const r = await CanonicalCampaign.open(d, { extension: ACTOR_FIXTURE_EXTENSION });
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
      : r.error.code;
  };
  const withTime =
    (value: number) =>
    (g: CommitGroup): CommitGroup =>
      g.writes.some((w) => w.key === KEY)
        ? {
            ...g,
            writes: g.writes.map((w) =>
              w.key === KEY
                ? {
                    ...w,
                    value: {
                      ...(w.value as any),
                      effective_from: { ...(w.value as any).effective_from, value },
                    },
                  }
                : w,
            ),
          }
        : g;

  it("a lawful acceptance stays valid after the clock later advances (and across a reopen and a replay); the consumers still follow it", async () => {
    const dir = tempDir("immortalis-clarify-h2-lawful-");
    const s = await startingShape(dir);
    const r = await retain(s.campaign, WORDS);
    expect((await clarify(s, keyOf(r))).ok).toBe(true);
    const moved = await advanceTo(s, T0.value + 5, "h2-a");
    expect(moved.ok, JSON.stringify(moved)).toBe(true);
    // the record is exactly as accepted; only the clock moved
    expect(s.collect.clarification(PC, ID)!.value.effective_from).toEqual(T0);
    expect(s.campaign.verify()).toEqual([]);
    // and the consumer still follows it at the later time
    expect(
      (
        await s.collect.establishMechanism({
          ...colPublication(7200),
          mechanism: mechanismInput(ID),
        })
      ).ok,
    ).toBe(true);
    await s.campaign.close();
    expect(await codes(dir)).toBe("OK");
    expect(await codes(await rogueReplay(dir))).toBe("OK");
  }, 480_000);

  it("a rogue backdated time, and one shifted from the acceptance time to the current time, each fail the load witness (even though neither is in the future)", async () => {
    const dir = tempDir("immortalis-clarify-h2-rogue-");
    const s = await startingShape(dir);
    const r = await retain(s.campaign, WORDS);
    expect((await clarify(s, keyOf(r))).ok).toBe(true);
    expect((await advanceTo(s, T0.value + 5, "h2-b")).ok).toBe(true);
    await s.campaign.close();
    // the lawful journal opens; each shifted copy of it does not
    expect(await codes(await rogueReplay(dir))).toBe("OK");
    for (const [name, value] of [
      ["backdated before the acceptance", T0.value - 1],
      ["shifted to the current (later) time", T0.value + 5],
      ["shifted to a time between", T0.value + 2],
    ] as const) {
      expect(await codes(await rogueReplay(dir, withTime(value))), name).not.toBe("OK");
    }
  }, 480_000);

  it("a clarification accepted AFTER an earlier advance is witnessed at the later time, and cannot be moved to the earlier one", async () => {
    const dir = tempDir("immortalis-clarify-h2-later-");
    const s = await startingShape(dir);
    expect((await advanceTo(s, T0.value + 3, "h2-c")).ok).toBe(true);
    const r = await retain(s.campaign, WORDS);
    expect((await clarify(s, keyOf(r))).ok).toBe(true);
    expect(s.collect.clarification(PC, ID)!.value.effective_from.value).toBe(T0.value + 3);
    expect((await advanceTo(s, T0.value + 9, "h2-d")).ok).toBe(true);
    await s.campaign.close();
    expect(await codes(await rogueReplay(dir))).toBe("OK");
    for (const value of [T0.value, T0.value + 9]) {
      expect(await codes(await rogueReplay(dir, withTime(value))), String(value)).not.toBe("OK");
    }
  }, 480_000);
});

describe("R-5 BLUE H-3: the preservation oracle is itself sensitive", () => {
  it("reads existing canonical records, and reports a change to the clock, the binding, the custody or the material", async () => {
    const s = await startingShape();
    try {
      const a = snapshot(s); // asserts that every preserved record exists at its canonical key
      expect(a.binding).toContain("active_pc");
      expect(a.custody).toContain(PC);
      expect(a.contract).toContain(PC);
      // mutation: the clock moves (a lawful, sealed Temporal transaction) and ONLY the clock differs
      expect((await advanceTo(s, T0.value + 4, "h3-a")).ok).toBe(true);
      const b = snapshot(s);
      expect(b).not.toEqual(a);
      expect(b.clock).not.toBe(a.clock);
      expect({ ...b, clock: "" }).toEqual({ ...a, clock: "" });
      // the oracle cannot pass vacuously: a record that is not there fails it, rather than comparing equal to itself
      const hollow = { campaign: { store: { getFact: () => undefined } } } as never;
      expect(() => snapshot(hollow)).toThrow();
    } finally {
      await s.campaign.close();
    }
  }, 180_000);
});
