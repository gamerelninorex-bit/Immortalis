/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// S1-P1 — the pure, read-only Auditory Premises evaluator, judged in isolation. A REAL committed lawful chain (through owner
// admission) is snapshotted, and each case corrupts ONE premise of an in-memory copy and asks again. This reaches every branch a
// forged or hostile history could, with no writer in sight: the evaluator takes a reader, never a store it could commit to.
import { beforeAll, describe, expect, it } from "vitest";
import {
  comparePlacementPins,
  actorPhysicalPresenceKey,
  actorRawSensoryStateKey,
  worldLocusKey,
  worldProfileKey,
  worldSetupClosureKey,
  worldAcousticEmissionKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  AUDITORY_REFUSAL_CODES,
  AUDITORY_UNRESOLVED_CODES,
  evaluateAuditoryPremises,
  type AuditoryPremisesReader,
  type AuditoryPremisesResult,
} from "@immortalis/engine";
import { tempDir } from "../support/tmp.ts";
import { A, EMISSION, L, L2, W, p1Chain, p1Scene } from "../support/auditory-premises.ts";
import { T0 } from "@immortalis/testkit";

const KEYS = {
  world: worldProfileKey(W),
  locus: worldLocusKey(W, L),
  closure: worldSetupClosureKey(W),
  b2: actorPhysicalPresenceKey(A),
  w1: actorRawSensoryStateKey(A),
  emission: worldAcousticEmissionKey(W, L, EMISSION),
};
const REQUEST = { actor_id: A, world_id: W, locus_id: L, emission_id: EMISSION };

interface Snap {
  readonly facts: ReadonlyMap<string, OwnerFact>;
  readonly revisions: ReadonlyMap<string, number>; // by intent id
  readonly ran: ReadonlySet<string>;
}
let snap: Snap;

beforeAll(async () => {
  const s = await p1Scene(tempDir());
  await p1Chain(s);
  const facts = new Map(s.campaign.store.listFacts().map((f) => [f.key, f] as const));
  const revisions = new Map<string, number>();
  for (const f of facts.values()) {
    revisions.set(
      f.provenance.intent_id,
      s.campaign.store.lookupReceipt(f.provenance.intent_id)!.revision,
    );
  }
  snap = { facts, revisions, ran: new Set(s.campaign.store.ruleCheckedGroupIds!()) };
});

interface Tweak {
  readonly facts?: (m: Map<string, OwnerFact>) => void;
  /** key -> the journal revision that key's fact is reported at */
  readonly revisions?: Readonly<Record<string, number | null>>;
  /** the evidence set: undefined = the real one, null = no evidence function at all */
  readonly ran?: ReadonlySet<string> | null;
}

const readerOf = (t: Tweak = {}): AuditoryPremisesReader => {
  const facts = new Map(snap.facts);
  t.facts?.(facts);
  const revs = new Map(snap.revisions);
  for (const [key, r] of Object.entries(t.revisions ?? {})) {
    const intent = snap.facts.get(key)!.provenance.intent_id;
    if (r === null) revs.delete(intent);
    else revs.set(intent, r);
  }
  const ran = t.ran === undefined ? snap.ran : t.ran;
  return {
    getFact: (k) => facts.get(k),
    lookupReceipt: (intent) =>
      revs.has(intent) ? ({ revision: revs.get(intent) } as never) : null,
    ...(ran === null ? {} : { ruleCheckedGroupIds: () => ran }),
  };
};

const patch = (key: string, over: Record<string, unknown>) => (m: Map<string, OwnerFact>) => {
  const f = m.get(key)!;
  m.set(key, { ...f, value: { ...(f.value as object), ...over } as never });
};
const version = (key: string, v: number) => (m: Map<string, OwnerFact>) => {
  m.set(key, { ...m.get(key)!, version: v });
};
const drop = (key: string) => (m: Map<string, OwnerFact>) => void m.delete(key);
const ask = (t: Tweak, request = REQUEST): AuditoryPremisesResult =>
  evaluateAuditoryPremises(readerOf(t), request);

const seen: AuditoryPremisesResult[] = [];
const expectOutcome = (r: AuditoryPremisesResult, result: string, code: string) => {
  seen.push(r);
  expect(r).toMatchObject({ result, code });
  expect(r).not.toHaveProperty("premises"); // every negative has no positive candidate
};

describe("control", () => {
  it("the unmodified committed chain is the one positive, naming only the exact pins and the one proposal it makes", () => {
    const r = ask({});
    seen.push(r);
    expect(r).toEqual({
      result: "SOURCE_PREMISES_READY_FOR_HEALTH",
      actor_id: A,
      world: { fact_key: KEYS.world, entity_id: W },
      locus: { fact_key: KEYS.locus, entity_id: L },
      event_instant: T0,
      premises: {
        locus: { fact_key: KEYS.locus, version: 1 },
        presence: { fact_key: KEYS.b2, version: 1 },
        raw_sensory: { fact_key: KEYS.w1, version: 1 },
        emission: { fact_key: KEYS.emission, version: 1 },
      },
      next_required: "HEALTH_SENSORY_FUNCTION_CLOSE",
    });
  });

  it("is a pure function of the committed premises: the same reader gives the same answer, and elapsed time after the event changes nothing", () => {
    expect(ask({})).toEqual(ask({}));
  });
});

describe("the owner rules must have demonstrably run: a snapshot that says nothing is not a pass", () => {
  it.each([
    ["no evidence function at all", { ran: null }],
    ["an empty evidence set", { ran: new Set<string>() }],
    [
      "a missing group (the emission's)",
      {
        get ran() {
          const g = snap.facts.get(KEYS.emission)!.provenance.group_id;
          return new Set([...snap.ran].filter((x) => x !== g));
        },
      },
    ],
    [
      "a missing group (W1's)",
      {
        get ran() {
          const g = snap.facts.get(KEYS.w1)!.provenance.group_id;
          return new Set([...snap.ran].filter((x) => x !== g));
        },
      },
    ],
    [
      "a missing group (the locus')",
      {
        get ran() {
          const g = snap.facts.get(KEYS.locus)!.provenance.group_id;
          return new Set([...snap.ran].filter((x) => x !== g));
        },
      },
    ],
  ])("%s is UNRESOLVED", (_n, t) => {
    expectOutcome(ask(t as Tweak), "UNRESOLVED", "OWNER_RULE_NOT_VERIFIED");
  });
});

describe("missing sources are never invented", () => {
  it("a missing world or locus, closure, B2 or W1 is UNRESOLVED; a missing emission or typed profile is a typed refusal", () => {
    expectOutcome(ask({ facts: drop(KEYS.locus) }), "UNRESOLVED", "LOCUS_MISSING");
    expectOutcome(ask({ facts: drop(KEYS.world) }), "UNRESOLVED", "LOCUS_MISSING");
    expectOutcome(ask({ facts: drop(KEYS.closure) }), "UNRESOLVED", "SETUP_CLOSURE_MISSING");
    expectOutcome(ask({ facts: drop(KEYS.b2) }), "UNRESOLVED", "PRESENCE_MISSING");
    expectOutcome(ask({ facts: drop(KEYS.w1) }), "UNRESOLVED", "RAW_SENSORY_MISSING");
    expectOutcome(ask({ facts: drop(KEYS.emission) }), "REFUSED", "NO_ACTUAL_EMISSION");
    expectOutcome(
      ask({
        facts: (m) => {
          const f = m.get(KEYS.locus)!;
          const { acoustic_profile_v1: _p, ...rest } = f.value as any;
          void _p;
          m.set(KEYS.locus, { ...f, value: rest });
        },
      }),
      "REFUSED",
      "ACOUSTIC_PROFILE_ABSENT",
    );
  });

  it("a premise that does not parse as its contract is UNRESOLVED", () => {
    for (const key of [KEYS.locus, KEYS.b2, KEYS.w1, KEYS.emission]) {
      expectOutcome(
        ask({ facts: (m) => m.set(key, { ...m.get(key)!, value: { garbage: true } as never }) }),
        "UNRESOLVED",
        "SOURCE_MALFORMED",
      );
    }
  });
});

describe("the subject must be a lawful non-PC actor", () => {
  it("a Player Character contract, or a Population ledger, of the same identity is a conclusive refusal", () => {
    const forged = (key: string) => (m: Map<string, OwnerFact>) =>
      m.set(key, { ...snap.facts.get(KEYS.b2)!, key, value: { garbage: true } as never });
    expectOutcome(
      ask({ facts: forged(`pc/${A}/existence-contract`) }),
      "REFUSED",
      "ACTOR_NOT_LAWFUL_NON_PC",
    );
    expectOutcome(
      ask({ facts: forged(`population/${A}/ledger`) }),
      "REFUSED",
      "ACTOR_NOT_LAWFUL_NON_PC",
    );
  });
});

describe("exact pins: a premise that is not this actor's, this emission's, its first version or the named version", () => {
  const sorted = (xs: { fact_key: string; version: number }[]) =>
    [...xs].sort(comparePlacementPins);
  const pins = (b2: { fact_key: string; version: number }, world = 1, locus = 1) =>
    sorted([
      { fact_key: KEYS.world, version: world },
      { fact_key: KEYS.locus, version: locus },
      b2,
    ]);
  const b2v1 = { fact_key: KEYS.b2, version: 1 };
  const other = { fact_key: "world-state/actor/someone-else/presence", version: 1 };

  it.each([
    ["a B2 of another actor", { facts: patch(KEYS.b2, { actor_id: "someone-else" }) }],
    [
      "a W1 of another actor (a schema-valid value for another actor's own slot)",
      {
        facts: patch(KEYS.w1, {
          actor_id: "someone-else",
          presence: other,
          dependency_refs: pins(other),
        }),
      },
    ],
    ["a second-version B2", { facts: version(KEYS.b2, 2) }],
    ["a second-version W1", { facts: version(KEYS.w1, 2) }],
    ["a second-version emission", { facts: version(KEYS.emission, 2) }],
    ["another emission identity", { facts: patch(KEYS.emission, { emission_id: "another" }) }],
    [
      "a W1 pinning a different B2 version than the committed one",
      {
        facts: patch(KEYS.w1, {
          presence: { fact_key: KEYS.b2, version: 2 },
          dependency_refs: pins({ fact_key: KEYS.b2, version: 2 }),
        }),
      },
    ],
    [
      "W1 premises that are not the exact committed world and locus versions",
      { facts: patch(KEYS.w1, { dependency_refs: pins(b2v1, 2, 2) }) },
    ],
    [
      "W1 premises with a capability basis offered as a premise",
      {
        facts: patch(KEYS.w1, {
          dependency_refs: sorted([
            ...pins(b2v1),
            { fact_key: "named-actor/actor-smith/capability-basis/x", version: 1 },
          ]),
        }),
      },
    ],
    [
      "W1 premises that omit the committed locus",
      { facts: patch(KEYS.w1, { dependency_refs: sorted([b2v1]) }) },
    ],
    [
      "an emission pinning a locus version that is not the committed one",
      { facts: patch(KEYS.emission, { emitting_source: { fact_key: KEYS.locus, version: 2 } }) },
    ],
    [
      "a profile version that is not the committed one",
      { facts: patch(KEYS.emission, { profile_locus_version: 2 }) },
    ],
    [
      "an emission sourced from another fact",
      { facts: patch(KEYS.emission, { emitting_source: { fact_key: KEYS.world, version: 1 } }) },
    ],
  ])("%s is UNRESOLVED", (_n, t) => {
    expectOutcome(ask(t as Tweak), "UNRESOLVED", "PREMISE_PIN_MISMATCH");
  });

  it("a W1 whose own value is internally inconsistent (its B2 pin is not its actor's slot, or not among its premises) is UNRESOLVED as malformed", () => {
    expectOutcome(
      ask({ facts: patch(KEYS.w1, { presence: other, dependency_refs: pins(other) }) }),
      "UNRESOLVED",
      "SOURCE_MALFORMED",
    );
    expectOutcome(
      ask({ facts: patch(KEYS.w1, { presence: { fact_key: KEYS.b2, version: 2 } }) }),
      "UNRESOLVED",
      "SOURCE_MALFORMED",
    );
  });
});

describe("the channel and the source", () => {
  it("an actor who is not at the emission's locus gets a conclusive refusal: no neighbour, corridor or propagation is modelled", () => {
    const here = { fact_key: worldLocusKey(W, L2), entity_id: L2 };
    expectOutcome(
      ask({ facts: patch(KEYS.b2, { locus: here }) }),
      "REFUSED",
      "EMISSION_NOT_AT_ACTOR_LOCUS",
    );
    expectOutcome(
      ask({
        facts: patch(KEYS.b2, {
          world: { fact_key: worldProfileKey("other"), entity_id: "other" },
        }),
      }),
      "REFUSED",
      "EMISSION_NOT_AT_ACTOR_LOCUS",
    );
  });

  it("an emission whose emitter is not the profile's named emitter is a conclusive refusal", () => {
    expectOutcome(
      ask({ facts: patch(KEYS.emission, { emitter_id: "emitter-invented" }) }),
      "REFUSED",
      "EMITTER_NOT_QUALIFIED",
    );
  });
});

describe("one defensible Temporal basis: no carry across elapsed time, no backfill, no unit confusion", () => {
  const later = { unit: T0.unit, value: 140 };
  it.each([
    [
      "a B2 at an earlier instant than W1 (stale after elapsed time)",
      { facts: patch(KEYS.b2, { effective_instant: { unit: T0.unit, value: 90 } }) },
    ],
    [
      "a W1 at another instant than B2 and the emission",
      { facts: patch(KEYS.w1, { effective_instant: later }) },
    ],
    [
      "an emission at a later instant than B2 and W1 (late)",
      { facts: patch(KEYS.emission, { event_instant: later }) },
    ],
    [
      "an emission at an earlier instant (retroactive)",
      { facts: patch(KEYS.emission, { event_instant: { unit: T0.unit, value: 99 } }) },
    ],
    [
      "an instant in another unit",
      { facts: patch(KEYS.emission, { event_instant: { unit: "other", value: T0.value } }) },
    ],
  ])("%s is UNRESOLVED", (_n, t) => {
    expectOutcome(ask(t as Tweak), "UNRESOLVED", "TEMPORAL_BASIS_CONFLICT");
  });
});

describe("journal order: profile, closure, B2, W1, emission", () => {
  const rev = (r: Partial<Record<keyof typeof KEYS, number | null>>) => ({
    revisions: Object.fromEntries(
      Object.entries(r).map(([k, v]) => [KEYS[k as keyof typeof KEYS], v]),
    ),
  });
  const at = (k: keyof typeof KEYS) =>
    snap.revisions.get(snap.facts.get(KEYS[k])!.provenance.intent_id)!;

  it.each([
    ["a W1 journaled after the emission (post-event)", () => rev({ w1: at("emission") + 1 })],
    ["a W1 journaled at the emission's own position", () => rev({ w1: at("emission") })],
    ["an emission journaled before W1", () => rev({ emission: at("w1") - 1 })],
    ["a W1 journaled before B2", () => rev({ w1: at("b2") - 1 })],
    ["a B2 journaled before the closure", () => rev({ b2: at("closure") - 1 })],
    [
      "a typed profile journaled after the closure (a late profile)",
      () => rev({ locus: at("closure") + 1 }),
    ],
    ["a premise with no journal position", () => rev({ w1: null })],
    ["a closure with no journal position", () => rev({ closure: null })],
  ])("%s is UNRESOLVED", (_n, t) => {
    expectOutcome(ask(t()), "UNRESOLVED", "CAUSAL_ORDER_CONFLICT");
  });

  it("an emission and a W1 that share one provenance are not independently authored", () => {
    expectOutcome(
      ask({
        facts: patch(KEYS.emission, {
          source_provenance: (snap.facts.get(KEYS.w1)!.value as any).source_provenance,
        }),
      }),
      "UNRESOLVED",
      "CAUSAL_ORDER_CONFLICT",
    );
  });
});

describe("the vocabulary of every answer", () => {
  it("answers only READY, a coded refusal or a coded unresolved: never a perception, a Health verdict, a receipt or a packet", () => {
    expect(seen.length).toBeGreaterThan(40);
    for (const r of seen) {
      expect(["SOURCE_PREMISES_READY_FOR_HEALTH", "REFUSED", "UNRESOLVED"]).toContain(r.result);
      if (r.result === "REFUSED") expect(AUDITORY_REFUSAL_CODES).toContain(r.code);
      if (r.result === "UNRESOLVED") expect(AUDITORY_UNRESOLVED_CODES).toContain(r.code);
      const text = JSON.stringify(r);
      expect(text).not.toMatch(
        /PERCEIVED|AVAILABLE|IMPAIRED|BOUNDED_SHARED_ACCESS|BROADCAST_EXPOSURE|receipt|packet/i,
      );
    }
  });

  it("the two code vocabularies are disjoint, so a refusal can never be mistaken for a missing premise", () => {
    const refusals = new Set<string>(AUDITORY_REFUSAL_CODES);
    expect(AUDITORY_UNRESOLVED_CODES.filter((c) => refusals.has(c))).toEqual([]);
  });
});
