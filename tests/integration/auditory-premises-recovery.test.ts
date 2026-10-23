/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// S1-P1 — persistence, replay and recovery. The positive result survives save, reopen and full replay (re-verified by the historical
// verifier on the real incremental pre-state, not read back from a snapshot); a forged, reordered or unverified history fails the
// open CLOSED; on-disk tampering is detected; a copy or rollback of a campaign is isolated from its siblings.
// MECHANISM ONLY: nothing here is perception, Health, a receipt or a player state.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  canonicalAdmission,
  openFileCampaign,
  verifyAuditoryPremisesIntegrity,
} from "@immortalis/engine";
import { FACET_WORLD_LOCUS, worldLocusKey } from "@immortalis/contracts";
import { ACTOR_FIXTURE_EXTENSION, T0, fixtureLocus } from "@immortalis/testkit";
import { must } from "../support/temporal.ts";
import { copyDir, tempDir } from "../support/tmp.ts";
import { reopen } from "../support/actor-presence.ts";
import {
  A,
  EMISSION,
  EMISSION_KEY,
  L,
  L2,
  LOCUS_KEY,
  RAW_KEY,
  W,
  acousticProfile,
  advanceTime,
  commitClosure,
  commitEmission,
  commitPlacement,
  commitPresence,
  commitRaw,
  establishClock,
  evaluate,
  fullChain,
  p1Chain,
  p1Group,
  p1Scene,
  rawSensoryValue,
  rogueP1,
  type R1Scene,
} from "../support/auditory-premises.ts";

const opens = async (dir: string): Promise<string> => {
  const r = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
  if (r.ok) {
    await r.value.close();
    return "OK";
  }
  return r.error.code;
};

/** `CODE: message` of a refused open, or "OK": the replay message names the historical rule that rejected the entry. */
const openWhy = async (dir: string): Promise<string> => {
  const r = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
  if (r.ok) {
    await r.value.close();
    return "OK";
  }
  return `${r.error.code}: ${r.error.message}`;
};

const LATER = { unit: T0.unit, value: T0.value + 40 };

// ---------------------------------------------------------------------------------------------
// save, reopen, replay
// ---------------------------------------------------------------------------------------------

describe("save, reopen and replay preserve the result, re-proved on the real incremental pre-state", () => {
  it("the one positive is identical after close and reopen, and the historical verifier demonstrably ran for every P1 group", async () => {
    const dir = tempDir();
    const s = await p1Scene(dir);
    await p1Chain(s);
    const before = evaluate(s);
    expect(before.result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
    const head = s.campaign.store.head();
    const values = [LOCUS_KEY, RAW_KEY, EMISSION_KEY].map(
      (k) => s.campaign.store.getFact(k)!.value,
    );
    await s.campaign.close();

    const r = await reopen(dir);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(
      [LOCUS_KEY, RAW_KEY, EMISSION_KEY].map((k) => r.campaign.store.getFact(k)!.value),
    ).toEqual(values);
    expect(r.campaign.verify()).toEqual([]);
    expect(evaluate(r)).toEqual(before);
    const ran = r.campaign.store.ruleCheckedGroupIds!();
    for (const k of [LOCUS_KEY, RAW_KEY, EMISSION_KEY]) {
      expect(ran.has(r.campaign.store.getFact(k)!.provenance.group_id)).toBe(true);
    }
    await r.campaign.close();
    // and again: reopening is idempotent
    const again = await reopen(dir);
    expect(evaluate(again)).toEqual(before);
    await again.campaign.close();
  });

  it("elapsed time AFTER the event does not change the answer about that event; the answer survives a later Temporal advance and reopen", async () => {
    const dir = tempDir();
    const s = await p1Scene(dir);
    await p1Chain(s);
    const before = evaluate(s);
    await advanceTime(s);
    expect(evaluate(s)).toEqual(before);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
    const r = await reopen(dir);
    expect(evaluate(r)).toEqual(before);
    expect(r.campaign.verify()).toEqual([]);
    await r.campaign.close();
  });

  it("is idempotent by identity: re-presenting a committed group changes nothing, and the same intent with other content conflicts", async () => {
    const s = await p1Scene(tempDir());
    await fullChain(s);
    const g = p1Group(
      s.campaign.store,
      RAW_KEY,
      rawSensoryValue(),
      [`world/${W}/profile`, LOCUS_KEY, `world-state/actor/${A}/presence`, "temporal/state"],
      "world_fallback_physical_entity",
    );
    const first = await must(s.campaign.store.commit(g));
    expect(first.replayed).toBe(false);
    const head = s.campaign.store.head();
    const second = await must(s.campaign.store.commit(g));
    expect(second.replayed).toBe(true);
    expect(s.campaign.store.head()).toEqual(head);
    const changed = await s.campaign.store.commit({
      ...g,
      writes: [
        { ...g.writes[0]!, value: rawSensoryValue({ raw_transduction: "ABSENT" }) as never },
      ],
    });
    expect(!changed.ok && changed.error.code).toBe("INTENT_CONFLICT");
    expect((s.campaign.store.getFact(RAW_KEY)!.value as any).raw_transduction).toBe("PRESENT");
  });

  it("the pure read writes nothing: asking, repeatedly, leaves the head, the facts and the journal byte-identical", async () => {
    const dir = tempDir();
    const s = await p1Scene(dir);
    await p1Chain(s);
    const head = s.campaign.store.head();
    const facts = JSON.stringify(s.campaign.store.listFacts());
    for (let i = 0; i < 5; i++) evaluate(s);
    evaluate(s, { emission_id: "nothing" });
    expect(s.campaign.store.head()).toEqual(head);
    expect(JSON.stringify(s.campaign.store.listFacts())).toBe(facts);
  });
});

// ---------------------------------------------------------------------------------------------
// forged histories fail the open
// ---------------------------------------------------------------------------------------------

describe("a forged or non-canonical history fails the open closed, whichever rule it breaks", () => {
  const forge = async (
    build: (v: R1Scene, store: Awaited<ReturnType<typeof rogueP1>>["store"]) => Promise<void>,
    o: Parameters<typeof rogueP1>[1] = {},
  ) => {
    const dir = tempDir();
    const r = await rogueP1(dir, o);
    await build(r.view, r.store);
    await r.store.close();
    return dir;
  };
  const lawful = async (v: R1Scene) => {
    await fullChain(v);
    await must(commitRaw(v));
    await must(commitEmission(v));
  };

  it("control: an unadmitted store holding the lawful chain still opens canonically, and the read then answers the one positive", async () => {
    const dir = await forge(lawful);
    expect(await opens(dir)).toBe("OK");
    const r = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
    const c = await must(Promise.resolve(r));
    expect(evaluate({ campaign: c }).result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
    await c.close();
  });

  it.each<[string, string, (v: R1Scene) => Promise<void>]>([
    [
      "a W1 whose instant is not the Temporal canonical time before it",
      "REFERENCE_INVALID",
      async (v) => {
        await fullChain(v);
        await must(commitRaw(v, { effective_instant: LATER }));
      },
    ],
    [
      "an emission whose instant is not the Temporal canonical time before it (backdated or forward-dated)",
      "REFERENCE_INVALID",
      async (v) => {
        await fullChain(v);
        await must(commitRaw(v));
        await must(commitEmission(v, { event_instant: LATER }));
      },
    ],
    [
      "a W1 journaled AFTER the emission it would qualify (post-event)",
      "REFERENCE_INVALID",
      async (v) => {
        await fullChain(v);
        await must(commitEmission(v));
        await must(commitRaw(v));
      },
    ],
    [
      "a W1 on a B2 that is stale after elapsed time (the B2's instant, after a Temporal advance)",
      "REFERENCE_INVALID",
      async (v) => {
        await fullChain(v);
        await advanceTime(v);
        await must(commitRaw(v));
      },
    ],
    [
      "a W1 carried across elapsed time (new instant, old B2)",
      "REFERENCE_INVALID",
      async (v) => {
        await fullChain(v);
        await advanceTime(v);
        const now = (v.campaign.store.getFact("temporal/state")!.value as any).canonical_time;
        await must(commitRaw(v, { effective_instant: now }));
      },
    ],
    [
      "a W1 for an actor with no B2 (a coupling or capability is not a position)",
      "PREREQUISITE_MISSING",
      async (v) => {
        await must(commitPlacement(v));
        await must(commitClosure(v));
        await must(establishClock(v));
        await must(
          commitRaw(v, {}, A, L, {
            reads: [
              { key: `world/${W}/profile`, version: 1 },
              { key: LOCUS_KEY, version: 1 },
              { key: `world-state/actor/${A}/presence`, version: 0 },
              { key: "temporal/state", version: 1 },
            ],
          }),
        );
      },
    ],
    [
      "a successor W1 (a replacement outside admission)",
      "AMENDMENT_NOT_SUPPORTED",
      async (v) => {
        await lawful(v);
        await must(
          v.campaign.store.commit(
            p1Group(
              v.campaign.store,
              RAW_KEY,
              rawSensoryValue({ raw_transduction: "ABSENT" }),
              [
                `world/${W}/profile`,
                LOCUS_KEY,
                `world-state/actor/${A}/presence`,
                "temporal/state",
              ],
              "world_fallback_physical_entity",
              {},
              1,
            ),
          ),
        );
      },
    ],
    [
      "an emission naming an emitter the original profile does not",
      "REFERENCE_INVALID",
      async (v) => {
        await fullChain(v);
        await must(commitRaw(v));
        await must(commitEmission(v, { emitter_id: "emitter-invented" }));
      },
    ],
    [
      "an emission whose provenance is the profile's own possible-impulse statement",
      "REFERENCE_INVALID",
      async (v) => {
        await fullChain(v);
        await must(commitRaw(v));
        await must(
          commitEmission(v, {
            source_provenance: (acousticProfile() as any).environmental_emitter_basis
              .bounded_impulse_possible_statement,
          }),
        );
      },
    ],
    [
      "an emission with no closure (a pre-seal source that was never sealed)",
      "PREREQUISITE_MISSING",
      async (v) => {
        await must(establishClock(v));
        await must(
          commitEmission(v, {}, L, {
            reads: [
              { key: `world/${W}/profile`, version: 1 },
              { key: LOCUS_KEY, version: 1 },
              { key: `world/${W}/setup-closure`, version: 0 },
              { key: "temporal/state", version: 1 },
            ],
          }),
        );
      },
    ],
  ])("%s", async (_name, rule, build) => {
    const dir = await forge(build);
    expect(await openWhy(dir)).toMatch(
      new RegExp(`^REPLAY_MISMATCH: .*entry fails historical verification: ${rule}`),
    );
  });

  it("a typed profile inserted AFTER the closure, and after Temporal, fails the open", async () => {
    const afterClosure = await forge(
      async (v, store) => {
        await must(commitPlacement(v));
        await must(commitClosure(v));
        await must(
          store.commit(
            p1Group(
              store,
              worldLocusKey(W, L2),
              fixtureLocus({ locus_id: L2, acoustic_profile_v1: acousticProfile() } as never),
              [`world/${W}/profile`],
              FACET_WORLD_LOCUS,
            ),
          ),
        );
      },
      { profile: false },
    );
    // the group above is not a lawful locus group (wrong rule), so the open fails closed at once
    expect(await opens(afterClosure)).not.toBe("OK");

    const lateLocus = await forge(
      async (v, store) => {
        await must(establishClock(v));
        const late = p1Group(
          store,
          worldLocusKey(W, L2),
          fixtureLocus({ locus_id: L2, acoustic_profile_v1: acousticProfile() } as never),
          [`world/${W}/profile`],
          FACET_WORLD_LOCUS,
        );
        await must(
          store.commit({
            ...late,
            rule: (await import("@immortalis/engine")).factKind("world_locus").rule,
          }),
        );
      },
      { profile: false },
    );
    expect(await opens(lateLocus)).toBe("REPLAY_MISMATCH");
  });

  it("a W1 over a PC identity cannot enter by replay either: the historical verifier judges the real pre-state", async () => {
    // lawful until W1 is committed against a campaign where the actor's own PC contract (not a compilation) exists
    const dir = await forge(async (v) => {
      await fullChain(v);
      const { fixtureContract } = await import("@immortalis/testkit");
      const { pcExistenceContractKey } = await import("@immortalis/contracts");
      const { factKind } = await import("@immortalis/engine");
      await must(
        v.campaign.store.commit({
          ...p1Group(
            v.campaign.store,
            pcExistenceContractKey(A),
            fixtureContract({ pc_id: A }),
            [],
            "existence_contract",
            { rule: factKind("pc_existence_contract").rule, owner: "pc_existence" },
          ),
          writes: [
            {
              key: pcExistenceContractKey(A),
              owner: "pc_existence",
              facet: "existence_contract",
              value: fixtureContract({ pc_id: A }) as never,
              unit: null,
              basis: "fixture-basis",
              secrecy: "fixture-visibility",
              expected_version: 0,
            },
          ],
        }),
      );
      await must(commitRaw(v));
    });
    expect(await opens(dir)).not.toBe("OK");
  });
});

// ---------------------------------------------------------------------------------------------
// fail closed without the verifier; legacy journals unchanged
// ---------------------------------------------------------------------------------------------

describe("a history that bears P1 facts must have been verified: it fails CLOSED otherwise", () => {
  const owners = new Map([...CANONICAL_OWNER_REGISTRY, ...ACTOR_FIXTURE_EXTENSION.owners]);

  it("opened WITHOUT the historical verifier every P1 fact is flagged and the read answers UNRESOLVED; with it, nothing is", async () => {
    const dir = tempDir();
    const s = await p1Scene(dir);
    await p1Chain(s);
    await s.campaign.close();
    expect(await opens(dir)).toBe("OK");

    const blind = await must(
      openFileCampaign(dir, { owners, admission: { check: canonicalAdmission.check } }),
    );
    const violations = verifyAuditoryPremisesIntegrity(blind);
    expect(violations.map((v) => v.code)).toEqual(Array(3).fill("AUDITORY_PREMISES_STATE"));
    expect(violations.map((v) => v.key).sort()).toEqual([EMISSION_KEY, LOCUS_KEY, RAW_KEY].sort());
    expect(violations.every((v) => /did not demonstrably run/.test(v.message))).toBe(true);
    expect(evaluate({ campaign: { store: blind } } as never)).toMatchObject({
      result: "UNRESOLVED",
      code: "OWNER_RULE_NOT_VERIFIED",
    });
    await blind.close();

    const verified = await must(openFileCampaign(dir, { owners, admission: canonicalAdmission }));
    expect(verifyAuditoryPremisesIntegrity(verified)).toEqual([]);
    expect(evaluate({ campaign: { store: verified } } as never).result).toBe(
      "SOURCE_PREMISES_READY_FOR_HEALTH",
    );
    await verified.close();
  });

  it("legacy journals with no P1 fact replay unchanged and carry no P1 evidence requirement", async () => {
    const dir = tempDir();
    const s = await p1Scene(dir, { profile: false });
    await fullChain(s);
    const head = s.campaign.store.head();
    await s.campaign.close();
    const opened = await must(
      openFileCampaign(dir, { owners, admission: { check: canonicalAdmission.check } }),
    );
    expect(opened.head().state_sha256).toBe(head.state_sha256);
    expect(verifyAuditoryPremisesIntegrity(opened)).toEqual([]);
    await opened.close();
  });

  it("a saved world whose locus has no profile keeps loading, value-identical, and is refused as a premise (no backfill)", async () => {
    const dir = tempDir();
    const s = await p1Scene(dir, { profile: false });
    const value = structuredClone(s.campaign.store.getFact(LOCUS_KEY)!.value);
    await s.campaign.close();
    const r = await reopen(dir);
    const reloaded = r.campaign.store.getFact(LOCUS_KEY)!.value as Record<string, unknown>;
    expect(reloaded).toEqual(value);
    expect(Object.keys(reloaded).sort()).toEqual([
      "constraints",
      "designation",
      "locus_id",
      "world",
    ]);
    expect(r.campaign.verify()).toEqual([]);
    expect(evaluate(r)).toMatchObject({ result: "REFUSED", code: "ACOUSTIC_PROFILE_ABSENT" });
    await r.campaign.close();
  });
});

// ---------------------------------------------------------------------------------------------
// on-disk tampering
// ---------------------------------------------------------------------------------------------

describe("on-disk tampering with a committed P1 fact is detected, never repaired into canon", () => {
  const stateFile = (d: string) => readdirSync(d).find((f) => /^state\.\d+\.json$/.test(f))!;
  const built = async () => {
    const dir = tempDir();
    const s = await p1Scene(dir);
    await p1Chain(s);
    await s.campaign.close();
    return dir;
  };
  const EARLIER_LAYERS = ["INTEGRITY_JOURNAL", "JOURNAL_TRUNCATED", "REPLAY_MISMATCH"];

  it.each([
    // same byte length: the edit survives the length check and is caught by the hash-chained replay itself
    ["a present transduction edited to an unknown one", '"PRESENT"', '"UNKNOWN"'],
    [
      "the emitter named by the profile and the emission edited (same length)",
      '"emitter-hall-gong"',
      '"emitter-hall-gonk"',
    ],
  ])("the journal, %s, fails the replay", async (_n, from, to) => {
    const dir = await built();
    const p = join(dir, "journal.jsonl");
    const text = readFileSync(p, "utf8");
    expect(text).toContain(from);
    writeFileSync(p, text.split(from).join(to));
    expect(await opens(dir)).toBe("REPLAY_MISMATCH");
  });

  it.each([
    ["a receptive faculty edited to nonreceptive", '"RECEPTIVE"', '"NONRECEPTIVE"'],
    ["a present transduction edited to absent", '"PRESENT"', '"ABSENT"'],
    ["the typed coverage edited to a weaker one", '"FULL_LOCUS_STRONG"', '"FULL_LOCUS_WEAK"'],
  ])(
    "the journal, %s, is detected by the journal's own integrity before replay",
    async (_n, from, to) => {
      const dir = await built();
      const p = join(dir, "journal.jsonl");
      const text = readFileSync(p, "utf8");
      expect(text).toContain(from);
      writeFileSync(p, text.split(from).join(to));
      expect(EARLIER_LAYERS).toContain(await opens(dir));
    },
  );

  it("the state file: a committed faculty, an emission or the typed profile edited in place is an integrity failure", async () => {
    const edits: [string, (v: any) => void][] = [
      [RAW_KEY, (v) => (v.ordinary_receptivity = "NONRECEPTIVE")],
      [EMISSION_KEY, (v) => (v.audible_material = "A different note entirely.")],
      [
        LOCUS_KEY,
        (v) => (v.acoustic_profile_v1.coverage_basis.whole_locus_reach = "Edited afterwards."),
      ],
    ];
    for (const [key, edit] of edits) {
      const dir = await built();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts.find((f: any) => f.key === key).value);
      writeFileSync(p, JSON.stringify(j, null, 2));
      expect(await opens(dir), key).toBe("INTEGRITY_STATE");
    }
  });

  it("the state file: a smuggled field in a P1 fact is refused", async () => {
    const dir = await built();
    const p = join(dir, stateFile(dir));
    const j = JSON.parse(readFileSync(p, "utf8"));
    j.facts.find((f: any) => f.key === RAW_KEY).value.health = "AVAILABLE";
    writeFileSync(p, JSON.stringify(j, null, 2));
    expect(await opens(dir)).not.toBe("OK");
  });
});

// ---------------------------------------------------------------------------------------------
// rollback and branch isolation
// ---------------------------------------------------------------------------------------------

describe("copies, branches and rollbacks are isolated: no premise crosses from one campaign to another", () => {
  it("two branches of one campaign diverge independently, and the original is untouched by either", async () => {
    const dir = tempDir();
    const s = await p1Scene(dir);
    await fullChain(s);
    await must(commitRaw(s));
    await s.campaign.close();
    const a = copyDir(dir);
    const b = copyDir(dir);

    const branchA = await reopen(a);
    await must(commitEmission(branchA));
    expect(evaluate(branchA).result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
    await branchA.campaign.close();

    const branchB = await reopen(b);
    expect(evaluate(branchB)).toMatchObject({ result: "REFUSED", code: "NO_ACTUAL_EMISSION" });
    // B authors a DIFFERENT emission identity: it is B's event, evaluated only as B's
    await must(commitEmission(branchB, {}, L, {}, "emission-b-only"));
    expect(evaluate(branchB, { emission_id: "emission-b-only" }).result).toBe(
      "SOURCE_PREMISES_READY_FOR_HEALTH",
    );
    expect(evaluate(branchB)).toMatchObject({ result: "REFUSED", code: "NO_ACTUAL_EMISSION" });
    await branchB.campaign.close();

    const original = await reopen(dir);
    expect(evaluate(original)).toMatchObject({ result: "REFUSED", code: "NO_ACTUAL_EMISSION" });
    expect(original.campaign.store.getFact(EMISSION_KEY)).toBeUndefined();
    await original.campaign.close();

    const again = await reopen(a);
    expect(evaluate(again).result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
    expect(again.campaign.store.getFact(worldLocusKey(W, L))).toBeDefined();
    await again.campaign.close();
  });

  it("a rollback to an earlier copy has no later premise, and the earlier answer is the earlier facts' answer, never a cached one", async () => {
    const dir = tempDir();
    const s = await p1Scene(dir);
    await fullChain(s);
    await s.campaign.close();
    const beforeW1 = copyDir(dir);

    const live = await reopen(dir);
    await must(commitRaw(live));
    await must(commitEmission(live));
    expect(evaluate(live).result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
    await live.campaign.close();

    const rolledBack = await reopen(beforeW1);
    expect(rolledBack.campaign.store.getFact(RAW_KEY)).toBeUndefined();
    expect(evaluate(rolledBack)).toMatchObject({ result: "REFUSED", code: "NO_ACTUAL_EMISSION" });
    // an emission authored on the rolled-back line before any W1 can never be qualified by one
    await must(commitEmission(rolledBack));
    expect(evaluate(rolledBack)).toMatchObject({
      result: "UNRESOLVED",
      code: "RAW_SENSORY_MISSING",
    });
    await rolledBack.campaign.close();
  });

  it("an identity is isolated per campaign: the same emission id in two campaigns names two unrelated events", async () => {
    const one = await p1Scene(tempDir());
    await p1Chain(one);
    const two = await p1Scene(tempDir());
    await fullChain(two);
    await must(commitRaw(two));
    expect(evaluate(one).result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
    expect(evaluate(two)).toMatchObject({ result: "REFUSED", code: "NO_ACTUAL_EMISSION" });
    void EMISSION;
    void commitPresence;
  });
});
