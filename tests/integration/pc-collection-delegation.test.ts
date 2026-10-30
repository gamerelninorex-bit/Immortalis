/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and forge raw groups */
// H1 (BLUE same-PR repair authorization; I-002 section 9 Delegation Commit Record; CPAA-C1 v0.3 F-2 "lawfully player-authored or
// delegated") — the DELEGATED selection of the collection cycle, ENGINE level. The starting shape is the live one: an already released and
// bound ordinary character whose accepted claims say the hands gather material and state NO duration. These tests prove what the engine
// enforces (admission, load verification, the consumers); the selection is the scripted answer (PLUMBING ONLY: nothing here shows that an
// AI chose or understood anything), and no row is a player's choice of the number.
import { describe, expect, it } from "vitest";
import {
  CanonicalCampaign,
  PC_INTRINSIC_CLARIFICATION_RULE,
  PcCollectionAdapter,
  interpretDelegatedSelection,
  pcClarificationIdOf,
  pcDelegationMirror,
  pcDelegationSeal,
  pcDelegationViolation,
} from "@immortalis/engine";
import {
  PcDelegatedClarificationSchema,
  PcDelegatedSelectionTaskSchema,
  pcExistenceContractKey,
  type CommitGroup,
} from "@immortalis/contracts";
import { ACTOR_FIXTURE_EXTENSION } from "@immortalis/testkit";
import { rogueReplay } from "../support/existing-actor.ts";
import {
  ACT_A,
  ACTUATOR_WORDS,
  MECH,
  PC,
  T0,
  collectionCampaign,
  colPublication,
  confirmAndStart,
} from "../support/pc-collection.ts";
import { NO_CYCLE_CLAIM, clarWords, retain } from "../support/pc-clarification.ts";
import {
  DELEGATION_ID,
  unboundedScope,
  DELEGATION_KEY,
  LONGEST,
  SELECTED,
  SHORTEST,
  delegateInput,
  delegatedCycleAnswer,
  delegationGroup,
  delegationScope,
  mechanismFromDelegation,
  selectedStatement,
  selectionAnswer,
} from "../support/pc-delegation.ts";
import { advanceTo } from "../support/pc-lapse.ts";
import { tempDir } from "../support/tmp.ts";

const startingShape = (dir = tempDir("immortalis-delegate-")) =>
  collectionCampaign({ dir, claimStatement: NO_CYCLE_CLAIM, noMechanism: true });
type Shape = Awaited<ReturnType<typeof startingShape>>;

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
const facts = (s: Shape) => new Map(s.campaign.store.listFacts().map((f) => [f.key, f]));
const editDelegation =
  (f: (v: any) => void) =>
  (g: CommitGroup): CommitGroup => {
    if (g.writes.some((w) => w.key === DELEGATION_KEY)) {
      const c: CommitGroup = JSON.parse(JSON.stringify(g));
      f(c.writes.find((w) => w.key === DELEGATION_KEY)!.value);
      return c;
    }
    return g;
  };

describe("H1 the delegated selection: the lawful path", () => {
  it("role.gm selects inside the player's bounds, the owner seals it, the mechanism and the attestation follow it, and the collection is timed by it", async () => {
    const dir = tempDir("immortalis-delegate-lawful-");
    const s = await startingShape(dir);
    const keysBefore = new Set(s.campaign.store.listFacts().map((f) => f.key));
    const contractBefore = JSON.stringify(s.campaign.store.getFact(pcExistenceContractKey(PC)));

    // the task is built from committed facts only: the accepted baseline, the branch, the player's scope, the method
    const task = s.collect.delegationTask(PC, delegationScope())!;
    expect(PcDelegatedSelectionTaskSchema.safeParse(task).success).toBe(true);
    expect(task.prior_closures).toEqual([]);
    expect(task.baseline.map((i) => i.text).join("\n")).toContain(ACTUATOR_WORDS);
    expect(task.scope.candidate_space).toMatchObject({ shortest: SHORTEST, longest: LONGEST });
    expect(task.method).toEqual({
      class: "ROLE_GM_NON_RANDOM_SELECTION",
      version: "pc-cycle-gm-selection:v1",
    });

    const done = await s.collect.delegate(delegateInput(s.collect, 7500));
    expect(done.ok, JSON.stringify((done as any).error)).toBe(true);
    const held = s.collect.delegation(PC)!;
    expect(held.fact.key).toBe(DELEGATION_KEY);
    const d = held.value;
    // the Delegation Commit Record carries every element I-002 section 9 names
    // the scope carries NUMERIC limits only: no free words exist in the record for anyone to trust
    expect(Object.keys(d.scope).sort()).toEqual(["branch", "candidate_space"]);
    expect(d.scope.candidate_space).toMatchObject({
      shortest: SHORTEST,
      longest: LONGEST,
      unit: T0.unit,
    });
    expect(d.generation_basis.task_digest).toBe(task.digest);
    expect(d.method).toEqual(task.method);
    expect(d.executing_role).toEqual({ role: "role.gm", permission: "permission.rule.adjudicate" });
    expect(d.draw).toBeNull(); // non-random method: no draw or seed exists
    expect(d.sealed.duration).toEqual({ unit: T0.unit, value: SELECTED });
    expect(d.sealed.claims).toEqual([
      { statement: selectedStatement(), provenance: "PLAYER-DELEGATED" },
    ]);
    expect(d.validation).toEqual({ result: "WITHIN_COMMITTED_SCOPE", derived_by: "pc_existence" });
    expect(d.accepted_by).toEqual({ role: "role.archivist", permission: "permission.canon.write" });
    expect(d.effective_from).toEqual(T0);
    expect(d.governing_package).toMatchObject({ line: "f027" });
    expect(JSON.stringify(d)).not.toContain("PLAYER-AUTHORED");
    // the Character Mirror confirms scope, method class and seal
    const mirror = pcDelegationMirror(d);
    expect(mirror).toMatchObject({
      sealed: true,
      seal: d.sealed.seal,
      executed_by: "role.gm",
      provenance: "PLAYER-DELEGATED",
      method: { class: "ROLE_GM_NON_RANDOM_SELECTION", random: false },
      scope: { shortest: SHORTEST, longest: LONGEST, unit: T0.unit },
    });

    // presenting it again reconciles by identity: the same receipt, nothing new
    const head = s.campaign.store.head().state_sha256;
    expect((await s.collect.delegate(delegateInput(s.collect, 7500))).ok).toBe(true);
    expect(s.campaign.store.head().state_sha256).toBe(head);

    // the mechanism follows the delegated claim; the cycle task tells the attesting host where it came from
    const mech = await s.collect.establishMechanism({
      ...colPublication(7510),
      mechanism: mechanismFromDelegation(),
    });
    expect(mech.ok, JSON.stringify((mech as any).error)).toBe(true);
    const cycleTask = s.collect.cycleTask(PC, MECH)!;
    expect(cycleTask.clarified).toEqual([
      {
        ref: { clarification: { fact_key: DELEGATION_KEY, version: 1 }, index: 0 },
        statement: selectedStatement(),
        provenance: "PLAYER-DELEGATED",
      },
    ]);
    const attested = await s.collect.attestCycle({
      pc_id: PC,
      mechanism_id: MECH,
      answer: delegatedCycleAnswer(cycleTask),
    });
    expect(attested.ok, JSON.stringify((attested as any).error)).toBe(true);

    // a collection is then timed by the selected cycle, exactly (Production derives it; nothing else supplies a duration)
    const started = await confirmAndStart(s, ACT_A, 3);
    expect(started.committed.ok, JSON.stringify((started.committed as any).error)).toBe(true);
    expect(started.started.ok, JSON.stringify((started.started as any).error)).toBe(true);
    const work = s.campaign.store
      .listFacts()
      .find((f) => f.key.startsWith("production/pc-collection-work/"))!.value as any;
    expect(work.derivation.causal_duration.value).toBe(3 * SELECTED);

    // nothing else moved: the released contract is untouched, and only the expected records were added
    expect(JSON.stringify(s.campaign.store.getFact(pcExistenceContractKey(PC)))).toBe(
      contractBefore,
    );
    const added = s.campaign.store
      .listFacts()
      .map((f) => f.key)
      .filter((k) => !keysBefore.has(k));
    expect(added).toContain(DELEGATION_KEY);
    expect(added.filter((k) => k.includes("/intrinsic-clarification/"))).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();

    // a fresh, ordinary-registry open re-verifies it all
    expect(await codes(dir)).toBe("OK");
    expect(await codes(await rogueReplay(dir))).toBe("OK");
  }, 360_000);
});

describe("H1 falsifiers: the host's selection is judged against the committed scope", () => {
  it("a number outside the bounds, a statement that does not state it, another number, an ungrounded quotation and another task each select nothing", async () => {
    const s = await startingShape();
    try {
      const bad = async (n: number, over: Record<string, unknown>, label: string) => {
        const r = await s.collect.delegate(
          delegateInput(s.collect, n, {
            answer: (task) =>
              selectionAnswer(task, {
                ...over,
              }),
          }),
        );
        expect(r.ok, label).toBe(false);
        expect(s.collect.delegation(PC), label).toBeUndefined();
      };
      const sel = (value: number, statement: string, ground = statement) => ({
        selection: { value, statement, statement_ground: ground },
      });
      await bad(
        7600,
        sel(SHORTEST - 1, selectedStatement(SHORTEST - 1)),
        "below the shortest bound",
      );
      await bad(7601, sel(LONGEST + 1, selectedStatement(LONGEST + 1)), "beyond the longest bound");
      await bad(7602, sel(SELECTED, selectedStatement(SELECTED + 1)), "states a different number");
      await bad(
        7603,
        sel(SELECTED, `${selectedStatement()} after 3 breaths`),
        "states another number besides the selected one",
      );
      await bad(
        7604,
        sel(SELECTED, `Handling one handful takes this body ${SELECTED} furlong`),
        "another unit",
      );
      await bad(
        7605,
        sel(SELECTED, selectedStatement(), "never said anywhere"),
        "ungrounded statement quotation",
      );
      await bad(
        7606,
        { baseline_ground: "the hands do something" },
        "ungrounded baseline quotation",
      );
      await bad(7607, { baseline_ground: null }, "no baseline quotation");
      await bad(7608, { task_digest: "0".repeat(64) }, "answers another task");
      await bad(7609, { selection: null }, "an unresolved reading that selects nothing");
      // a genuine refusal by the host is not a selection and writes nothing
      await bad(
        7610,
        { branch: "ALREADY_STATED_IN_BASELINE", selection: null, baseline_ground: null },
        "the branch is stated in the baseline",
      );
      await bad(
        7611,
        {
          scope: "ADDS_OR_CHANGES_A_CAPABILITY_OR_ACTUATOR",
          selection: null,
          baseline_ground: null,
        },
        "the request changes a capability",
      );
      // an answer that refuses AND selects is incoherent
      await bad(
        7612,
        { branch: "ALREADY_STATED_IN_BASELINE" },
        "refusal that still carries a selection",
      );

      // the interpretation itself is pure: the same verdicts without a store
      const task = s.collect.delegationTask(PC, delegationScope())!;
      expect(interpretDelegatedSelection(task, selectionAnswer(task)).ok).toBe(true);
      expect(interpretDelegatedSelection(task, "nonsense").ok).toBe(false);
    } finally {
      await s.campaign.close();
    }
  }, 240_000);

  it("a malformed scope (reversed, zero, fractional, missing, unknown branch, free words) forms no task; a non-canonical unit is refused by the owner", async () => {
    const s = await startingShape();
    try {
      const space = (over: Record<string, unknown>) =>
        delegationScope({
          candidate_space: { ...delegationScope().candidate_space, ...over },
        });
      // reversed bounds, zero, a fraction, and no candidate space at all cannot form a task; nor can free words (below)
      expect(s.collect.delegationTask(PC, space({ shortest: 9, longest: 3 }))).toBeUndefined();
      expect(s.collect.delegationTask(PC, space({ shortest: 0 }))).toBeUndefined();
      expect(s.collect.delegationTask(PC, space({ longest: 1.5 }))).toBeUndefined();
      expect(
        s.collect.delegationTask(PC, delegationScope({ candidate_space: undefined })),
      ).toBeUndefined();
      expect(
        s.collect.delegationTask(PC, delegationScope({ branch: "ANOTHER_BRANCH" })),
      ).toBeUndefined();
      // a unit that is not the campaign's canonical unit forms a task but the owner refuses the record (Temporal keeps unit authority)
      const odd = space({ unit: "furlong" });
      const refused = await s.collect.delegate({
        ...colPublication(7620),
        pc_id: PC,
        scope: odd,
        answer: selectionAnswer(s.collect.delegationTask(PC, odd), {
          selection: {
            value: SELECTED,
            statement: selectedStatement(SELECTED, "furlong"),
            statement_ground: selectedStatement(SELECTED, "furlong"),
          },
        }),
      });
      expect(refused.ok).toBe(false);
      expect(s.collect.delegation(PC)).toBeUndefined();
    } finally {
      await s.campaign.close();
    }
  }, 180_000);
});

describe("H1-C: constraints the owner cannot verify are never certified; the numeric limits it can verify are enforced", () => {
  const limitFive = () =>
    delegationScope({
      candidate_space: { ...delegationScope().candidate_space, shortest: 4, longest: 5 },
    });
  const nine = (v: any) => {
    v.sealed.duration.value = 9;
    v.sealed.claims[0].statement = selectedStatement(9);
    v.sealed.reading.statement_ground = selectedStatement(9);
  };

  it('the player\'s "never more than five seconds" is the longest limit: a valid-looking choice of 9 is refused by the host check, by admission and at load, and 5 is sealed', async () => {
    const dir = tempDir("immortalis-delegate-limit-");
    const s = await startingShape(dir);
    try {
      const task5 = s.collect.delegationTask(PC, limitFive())!;
      // the host chooses 9 with otherwise perfectly valid quotations: it is outside the committed limit, so nothing seals
      const host9 = await s.collect.delegate({
        ...colPublication(7630),
        pc_id: PC,
        scope: limitFive(),
        answer: selectionAnswer(task5, {
          selection: {
            value: 9,
            statement: selectedStatement(9),
            statement_ground: selectedStatement(9),
          },
        }),
      });
      expect(host9.ok).toBe(false);
      expect((host9 as any).error.message).toMatch(/candidate space/);
      expect(s.collect.delegation(PC)).toBeUndefined();
      // the same choice written straight at the owner (a forged record, correctly sealed) is refused by admission, which re-derives the check
      const forged = await s.campaign.store.commit(
        delegationGroup(s.campaign, s.collect, 7631, {
          scope: limitFive(),
          value: nine,
          reseal: true,
        }),
      );
      expect(forged.ok).toBe(false);
      expect((forged as any).error.message).toMatch(/candidate space/);
      expect(s.collect.delegation(PC)).toBeUndefined();
      // a choice inside the limit seals, and the record carries the limit it was validated against
      const host5 = await s.collect.delegate({
        ...colPublication(7632),
        pc_id: PC,
        scope: limitFive(),
        answer: selectionAnswer(task5, {
          selection: {
            value: 5,
            statement: selectedStatement(5),
            statement_ground: selectedStatement(5),
          },
        }),
      });
      expect(host5.ok, JSON.stringify((host5 as any).error)).toBe(true);
      const d = s.collect.delegation(PC)!.value;
      expect(d.scope.candidate_space).toMatchObject({ shortest: 4, longest: 5 });
      expect(d.sealed.duration.value).toBe(5);
      await s.campaign.close();
      // load verification re-derives it: the lawful record opens, the same record with the choice moved outside the limit does not
      expect(await codes(dir)).toBe("OK");
      expect(
        await codes(
          await rogueReplay(
            dir,
            editDelegation((v) => {
              nine(v);
              // resealed, so that the range is the ONLY defect the loader can find
              v.sealed.seal = pcDelegationSeal({
                pc_id: v.pc_id,
                scope: v.scope,
                generation_basis: v.generation_basis,
                sealed: v.sealed,
              });
            }),
          ),
        ),
      ).not.toBe("OK");
    } finally {
      await s.campaign.close().catch(() => undefined);
    }
  }, 360_000);

  it("free words are not a constraint class: a scope that carries them forms no task, and a record that carries them fails the strict schema", async () => {
    const s = await startingShape();
    try {
      const words = { ...limitFive(), constraint_words: "never more than five seconds" };
      expect(s.collect.delegationTask(PC, words)).toBeUndefined();
      const refused = await s.collect.delegate({
        ...colPublication(7640),
        pc_id: PC,
        scope: words,
        answer: selectionAnswer(s.collect.delegationTask(PC, limitFive())!),
      });
      expect(refused.ok).toBe(false);
      const raw = await s.campaign.store.commit(
        delegationGroup(s.campaign, s.collect, 7641, {
          scope: limitFive(),
          value: (v) => {
            v.scope.constraint_words = "never more than five seconds";
            v.sealed.duration.value = 5;
            v.sealed.claims[0].statement = selectedStatement(5);
            v.sealed.reading.statement_ground = selectedStatement(5);
          },
          reseal: true,
        }),
      );
      expect(raw.ok).toBe(false);
      expect(s.collect.delegation(PC)).toBeUndefined();
    } finally {
      await s.campaign.close();
    }
  }, 240_000);

  it("a delegation that carries no limit at all is lawful (a seed that leaves the detail to the GM): the scope is the branch and the baseline, the choice is the host's grounded one, and the consumers follow it", async () => {
    const s = await startingShape();
    try {
      const none = unboundedScope();
      const task = s.collect.delegationTask(PC, none)!;
      expect(task.scope.candidate_space).toMatchObject({ shortest: 1, longest: null });
      // a non-positive or fractional choice can never be sealed
      for (const [n, value] of [
        [7650, 0],
        [7651, -3],
        [7652, 2.5],
      ] as const)
        expect(
          (
            await s.collect.delegate({
              ...colPublication(n),
              pc_id: PC,
              scope: none,
              answer: selectionAnswer(task, {
                selection: {
                  value,
                  statement: `Handling one handful takes this body ${value} ${T0.unit}`,
                  statement_ground: `Handling one handful takes this body ${value} ${T0.unit}`,
                },
              }),
            })
          ).ok,
          String(value),
        ).toBe(false);
      const done = await s.collect.delegate({
        ...colPublication(7653),
        pc_id: PC,
        scope: none,
        answer: selectionAnswer(task),
      });
      expect(done.ok, JSON.stringify((done as any).error)).toBe(true);
      const d = s.collect.delegation(PC)!.value;
      expect(d.scope.candidate_space).toMatchObject({ shortest: 1, longest: null });
      expect(pcDelegationMirror(d).scope).toMatchObject({ shortest: 1, longest: null });
      expect(
        (
          await s.collect.establishMechanism({
            ...colPublication(7654),
            mechanism: mechanismFromDelegation(),
          })
        ).ok,
      ).toBe(true);
      const cycle = s.collect.cycleTask(PC, MECH)!;
      expect(
        (
          await s.collect.attestCycle({
            pc_id: PC,
            mechanism_id: MECH,
            answer: delegatedCycleAnswer(cycle),
          })
        ).ok,
      ).toBe(true);
    } finally {
      await s.campaign.close();
    }
  }, 240_000);
});

describe("H1 falsifiers: the record itself (admission re-derives it)", () => {
  it("forged provenance, role, validation, draw, method, seal, content, pins, time, rule and identity are each refused; the lawful control commits", async () => {
    const s = await startingShape();
    try {
      const commit = (g: CommitGroup) => s.campaign.store.commit(g);
      const forged = (n: number, f: (v: any) => void, reseal = false) =>
        commit(delegationGroup(s.campaign, s.collect, n, { value: f, reseal }));
      const lawful = delegationGroup(s.campaign, s.collect, 7700);
      expect(PcDelegatedClarificationSchema.safeParse(lawful.writes[0]!.value).success).toBe(true);
      const cases: Record<string, (v: any) => void> = {
        "GM wording passed as the player's own": (v) =>
          (v.sealed.claims[0].provenance = "PLAYER-AUTHORED"),
        "the player as the executing role": (v) =>
          (v.executing_role = { role: "role.player", permission: "permission.rule.adjudicate" }),
        "the resolver as the executing role": (v) =>
          (v.executing_role = { role: "role.resolver", permission: "permission.rule.adjudicate" }),
        "a forged archivist": (v) =>
          (v.accepted_by = { role: "role.player", permission: "permission.canon.write" }),
        "a claimed validation that is not the owner's": (v) =>
          (v.validation.derived_by = "role.gm"),
        "a draw where the method is not random": (v) => (v.draw = { seed: "abc" }),
        "another method class": (v) => (v.method.class = "ROLE_RESOLVER_RANDOM_DRAW"),
        "another method version": (v) => (v.method.version = "pc-cycle-gm-selection:v2"),
        "a retroactive effective time": (v) =>
          (v.effective_from = { ...v.effective_from, value: 0 }),
        "a future effective time": (v) =>
          (v.effective_from = { ...v.effective_from, value: 10_000 }),
        "a stale contract pin": (v) => (v.contract.version += 1),
        "a stale binding pin": (v) => (v.binding.version += 1),
        "a delegation of another character": (v) => (v.pc_id = "pc-someone-else"),
        "another slot identity": (v) => (v.delegation_id = "delegation-0000000000000000"),
        "another governing package": (v) => (v.governing_package.package_version = "v9.9"),
        "another question": (v) => (v.invocation.question = "Pick whatever you like."),
      };
      let n = 7701;
      for (const [name, f] of Object.entries(cases)) {
        expect((await forged(n++, f)).ok, name).toBe(false);
      }
      // content defects, each isolated by resealing so that only the content itself is wrong
      const contentCases: Record<string, (v: any) => void> = {
        "a number below the committed bounds": (v) => {
          v.sealed.duration.value = SHORTEST - 1;
          v.sealed.claims[0].statement = selectedStatement(SHORTEST - 1);
          v.sealed.reading.statement_ground = selectedStatement(SHORTEST - 1);
        },
        "a number beyond the committed bounds": (v) => {
          v.sealed.duration.value = LONGEST + 5;
          v.sealed.claims[0].statement = selectedStatement(LONGEST + 5);
          v.sealed.reading.statement_ground = selectedStatement(LONGEST + 5);
        },
        "a duration in another unit": (v) => (v.sealed.duration.unit = "furlong"),
        "a statement that states another number": (v) =>
          (v.sealed.claims[0].statement = selectedStatement(SELECTED + 1)),
        "a statement that adds a number": (v) =>
          (v.sealed.claims[0].statement = `${selectedStatement()} in 2 pieces`),
        "an ungrounded baseline quotation": (v) =>
          (v.sealed.reading.baseline_ground = "a thing the baseline never said"),
        "an ungrounded statement quotation": (v) =>
          (v.sealed.reading.statement_ground = "a thing the statement never said"),
        "a loosened candidate space (the task it answered differs)": (v) => {
          v.scope.candidate_space.longest = 5000;
        },
        "a generation basis of another baseline": (v) =>
          (v.generation_basis.baseline_digest = "0".repeat(64)),
      };
      for (const [name, f] of Object.entries(contentCases)) {
        expect((await forged(n++, f, true)).ok, name).toBe(false);
      }
      // a stale seal (content changed after sealing) and another rule
      expect(
        (
          await forged(
            n++,
            (v) => (v.sealed.claims[0].statement = `${selectedStatement()} exactly`),
          )
        ).ok,
        "a content edit that leaves the seal stale",
      ).toBe(false);
      expect(
        (
          await commit(
            delegationGroup(s.campaign, s.collect, n++, {
              group: { rule: PC_INTRINSIC_CLARIFICATION_RULE },
            }),
          )
        ).ok,
        "governed by the player-authored clarification rule",
      ).toBe(false);
      expect(s.collect.delegation(PC)).toBeUndefined();

      // the control: the lawful group commits, once; it is never amended
      expect((await commit(delegationGroup(s.campaign, s.collect, n++))).ok).toBe(true);
      const second = delegationGroup(s.campaign, s.collect, n++);
      (second.writes[0] as any).expected_version = 1;
      expect((await commit(second)).ok, "an amendment").toBe(false);
      expect(s.collect.delegation(PC)!.fact.version).toBe(1);
    } finally {
      await s.campaign.close();
    }
  }, 480_000);

  it("shares the ONE slot of the branch with the player's own clarification, in both orders", async () => {
    // delegation first: the player's own words can no longer be accepted for the closed branch
    const first = await startingShape();
    try {
      expect((await first.collect.delegate(delegateInput(first.collect, 7800))).ok).toBe(true);
      const recorded = await retain(first.campaign, [clarWords()]);
      // the host's scoped classification already sees the closure, and the owner refuses the clarification
      const scope = first.collect.clarificationScope(PC)!;
      expect(scope.prior_closures).toHaveLength(1);
      expect(scope.prior_closures[0]!.clarification_id).toBe(DELEGATION_ID);
      const r = (recorded as any).value.record.key as string;
      const closed = await first.collect.clarify({
        ...colPublication(7801),
        pc_id: PC,
        statements: [clarWords()],
        referee_key: r,
      });
      expect(closed.ok).toBe(false);
      expect(first.collect.clarification(PC, pcClarificationIdOf(PC))).toBeUndefined();
    } finally {
      await first.campaign.close();
    }
    // the player's own words first: the branch is closed and a delegation is declined
    const second = await startingShape();
    try {
      const recorded = await retain(second.campaign, [clarWords()]);
      expect(recorded.ok).toBe(true);
      const accepted = await second.collect.clarify({
        ...colPublication(7810),
        pc_id: PC,
        statements: [clarWords()],
        referee_key: (recorded as any).value.record.key,
      });
      expect(accepted.ok).toBe(true);
      const task = second.collect.delegationTask(PC, delegationScope())!;
      expect(task.prior_closures).toHaveLength(1);
      const declined = await second.collect.delegate(delegateInput(second.collect, 7811));
      expect(declined.ok).toBe(false);
      expect(second.collect.delegation(PC)).toBeUndefined();
      // and a mechanism that cites a delegation that does not exist is refused
      const cited = await second.collect.establishMechanism({
        ...colPublication(7812),
        mechanism: mechanismFromDelegation(),
      });
      expect(cited.ok).toBe(false);
    } finally {
      await second.campaign.close();
    }
  }, 360_000);
});

describe("H1 late delegation: nothing that depends on the cycle may already have begun", () => {
  it("is declined once a collection commitment of the character exists (the branch stays unresolved)", async () => {
    const dir = tempDir("immortalis-delegate-late-");
    const s = await collectionCampaign({ dir });
    try {
      expect((await confirmAndStart(s, ACT_A, 3)).committed.ok).toBe(true);
      const late = await s.collect.delegate(delegateInput(s.collect, 7900));
      expect(late.ok).toBe(false);
      expect(s.collect.delegation(PC)).toBeUndefined();
      const why = pcDelegationViolation(
        DELEGATION_KEY,
        PcDelegatedClarificationSchema.parse(
          delegationGroup(s.campaign, s.collect, 7901).writes[0]!.value,
        ),
        facts(s),
      );
      expect(why).toMatch(/dependent collection commitment/);
    } finally {
      await s.campaign.close();
    }
  }, 240_000);

  it("a delegation committed AFTER a collection commitment (outside admission) is refused at load: it would be selected into play", async () => {
    const dir = tempDir("immortalis-delegate-rogue-late-");
    const s = await collectionCampaign({ dir });
    expect((await confirmAndStart(s, ACT_A, 3)).committed.ok).toBe(true);
    await s.campaign.close();
    // the control: the lawful journal opens
    expect(await codes(await rogueReplay(dir))).toBe("OK");
    const late = await rogueReplay(
      dir,
      (g) => g,
      async (store) => {
        const group = delegationGroup({ store }, new PcCollectionAdapter(store), 7999);
        expect((await store.commit(group)).ok).toBe(true);
      },
    );
    expect(await codes(late)).not.toBe("OK");
  }, 360_000);
});

describe("H1 recovery and load verification: the record is re-derived on every open", () => {
  it("survives a clock advance and a reopen; a rewritten statement, seal, bound, time or provenance fails the load", async () => {
    const dir = tempDir("immortalis-delegate-recovery-");
    const s = await startingShape(dir);
    expect((await s.collect.delegate(delegateInput(s.collect, 8000))).ok).toBe(true);
    expect((await advanceTo(s, T0.value + 5, "h1-a")).ok).toBe(true);
    // the record is exactly as accepted; only the clock moved
    expect(s.collect.delegation(PC)!.value.effective_from).toEqual(T0);
    expect(s.campaign.verify()).toEqual([]);
    // and the consumer still follows it at the later time
    expect(
      (
        await s.collect.establishMechanism({
          ...colPublication(8001),
          mechanism: mechanismFromDelegation(),
        })
      ).ok,
    ).toBe(true);
    await s.campaign.close();
    expect(await codes(dir)).toBe("OK");
    expect(await codes(await rogueReplay(dir))).toBe("OK");

    const cases: Record<string, (v: any) => void> = {
      "a rewritten statement with the old seal": (v) =>
        (v.sealed.claims[0].statement = `${selectedStatement()} exactly`),
      "a resealed number outside the bounds": (v) => {
        v.sealed.duration.value = LONGEST + 3;
        v.sealed.claims[0].statement = selectedStatement(LONGEST + 3);
        v.sealed.reading.statement_ground = selectedStatement(LONGEST + 3);
      },
      "provenance rewritten to the player's own": (v) =>
        (v.sealed.claims[0].provenance = "PLAYER-AUTHORED"),
      "the executing role rewritten": (v) => (v.executing_role.role = "role.player"),
      "a backdated acceptance time": (v) => (v.effective_from = { ...v.effective_from, value: 0 }),
      "an acceptance time shifted to the current clock": (v) =>
        (v.effective_from = { ...v.effective_from, value: T0.value + 5 }),
      "the question altered": (v) => (v.invocation.question = "Whatever."),
    };
    for (const [name, f] of Object.entries(cases)) {
      expect(await codes(await rogueReplay(dir, editDelegation(f))), name).not.toBe("OK");
    }
  }, 600_000);
});
