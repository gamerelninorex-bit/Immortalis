// B0-40..B0-50 — links, continuation context and same-identity conflicts for F-014B package B0 (docs/f014b/b0-gm-request-contract.md §2.5, §4 R20, R40-R51, §5.3, §7).
//
// T1 mechanism component (BLUE v0.3 §4): strict request/refusal contract only; no B1 positive, no T0 PASS, no production capability; F-014B LC closures unchanged.
//
// What it exercises: parseGmWaitRequest, gmContinuationLinkViolation, continuationContextViolation and gmWaitSameIdConflict in
// packages/contracts/src/temporal-gm-wait.ts, imported by relative path, together with the EXISTING continuationRequestViolation (read-only, called
// exactly as the kernel calls it). Every function is pure: the "held state" and the "sealed prior" below are plain values built in this file, not read
// from anything. A returned null means only "this comparison finds no violation", never that a continuation was admitted.
//
// The prior-context rule is the N-1 rule: a continuation is stated under exactly the role and permission of the transaction it continues, and under no
// other equality (no trigger, cause, transport or publication). It sits BESIDE the existing target/condition predicate and never replaces it, and the
// existing predicate has two independent branches, so the tests build the two kinds of sealed prior separately and never let one stand for the other:
//   U  the prior stopped with unresolved dependents: the original requested target AND condition are carried forward unchanged (exact equality).
//   R  the prior left only a target remainder: the continuation consumes exactly remainder.to; its condition plays no part.
// For each branch the tests show the new rule refusing while the existing predicate returns null, and the existing predicate refusing while the new rule
// returns null. A GM-context prior is the player-context sealed fixture with only its context changed: both rules read just the context, requested and
// outcome, and the unchanged sealed schema is not asked to accept it.
import { describe, expect, it } from "vitest";
import {
  GM_ADJUDICATION_AUTHORITY,
  PLAYER_CHOICE_AUTHORITY,
  ResolutionRequestSchema,
  ResolutionTransactionSchema,
  type ResolutionTransaction,
} from "@immortalis/contracts";
import { continuationRequestViolation } from "@immortalis/engine";
import {
  BOUNDARY_ID,
  CONSUMER_STAGE,
  OBJECT_ENGAGED,
  PRODUCER_STAGE,
  SYNTH_OWNER,
  SYNTH_SOURCE_KEY,
  T1,
  TB,
  at,
  stopAtBoundaryRequest,
} from "@immortalis/testkit";
import {
  GM_INTERPRETED_PC_WAIT,
  continuationContextViolation,
  gmContinuationLinkViolation,
  gmWaitSameIdConflict,
  parseGmWaitRequest,
  type GmWaitRequestShape,
} from "../../packages/contracts/src/temporal-gm-wait.ts";

type Value = Record<string, unknown>;
type Pair = { role: string; permission: string };

const GM: Pair = { ...GM_ADJUDICATION_AUTHORITY };
const PLAYER: Pair = { ...PLAYER_CHOICE_AUTHORITY };
const DIGEST = "0123456789abcdef".repeat(4);
const PRIOR_ID = "tx-prior";

// ---------------------------------------------------------------------------------------------
// Request specimens (shape-valid GM requests)
// ---------------------------------------------------------------------------------------------

const initialRequest = (): Value => ({
  transaction_id: "gm-wait-tx-1",
  cause: "cause-gm-wait-1",
  trigger: { kind: GM_INTERPRETED_PC_WAIT, ref: "ref-gm-wait-1" },
  continues: null,
  requested: { target: { unit: "time-unit-fixture", value: 1120 }, condition: null },
  context: { ...GM },
  publication: { basis: "basis-label-1", secrecy: "secrecy-label-1" },
  gm_wait: {
    phase: "INITIAL",
    duration_value: 2,
    duration_unit: "minute",
    observed_basis: { unit: "time-unit-fixture", value: 1000 },
    interpretation_mode: "EXPLICIT_DURATION",
    conversion_rule_version: "SI_SUBDAY_V1",
    catalogue_sha256: DIGEST,
  },
});

const continuationRequest = (): Value => ({
  transaction_id: "gm-wait-tx-2",
  cause: "cause-gm-wait-2",
  trigger: { kind: GM_INTERPRETED_PC_WAIT, ref: "ref-gm-wait-2" },
  continues: "gm-wait-tx-1",
  requested: { target: { unit: "time-unit-fixture", value: 1120 }, condition: null },
  context: { ...GM },
  publication: { basis: "basis-label-1", secrecy: "secrecy-label-1" },
  gm_wait: { phase: "CONTINUATION", from_transaction: "gm-wait-tx-1" },
});

const edit = (base: Value, path: readonly string[], value: unknown): Value => {
  const out = structuredClone(base);
  let node = out;
  for (const key of path.slice(0, -1)) node = node[key] as Value;
  node[path[path.length - 1]!] = value;
  return out;
};

const typed = (raw: Value): GmWaitRequestShape => {
  const r = parseGmWaitRequest(raw);
  if (!r.ok) throw new Error(`specimen did not parse: ${r.error.message}`);
  return r.value;
};

/** A refusal by a cross-field rule: INPUT_INVALID with no shape issues and no pairing reason. */
const refusedByRule = (raw: unknown, message: RegExp): boolean => {
  const r = parseGmWaitRequest(raw);
  return (
    !r.ok &&
    r.error.code === "INPUT_INVALID" &&
    r.error.details === undefined &&
    message.test(r.error.message)
  );
};

describe("B0 refusal-only: the continues link", () => {
  it("B0 refusal-only: an INITIAL with a non-null continues is refused (R20)", () => {
    expect(parseGmWaitRequest(initialRequest()).ok).toBe(true);
    for (const continues of ["gm-wait-tx-0", "tx-1", "gm-wait-tx-1"]) {
      const v = edit(initialRequest(), ["continues"], continues);
      expect(parseGmWaitRequest(v).ok, continues).toBe(false);
      expect(refusedByRule(v, /INITIAL .* must not continue/), continues).toBe(true);
    }
    // a continues that is not even an identifier is refused by the shape instead
    expect(parseGmWaitRequest(edit(initialRequest(), ["continues"], "bad/id")).ok).toBe(false);
  });

  it("B0 refusal-only: a CONTINUATION with a null continues, or a continues that differs from its from_transaction, is refused (R40, R41)", () => {
    expect(parseGmWaitRequest(continuationRequest()).ok).toBe(true);
    const nullContinues = edit(continuationRequest(), ["continues"], null);
    expect(parseGmWaitRequest(nullContinues).ok).toBe(false);
    expect(refusedByRule(nullContinues, /must name the transaction it continues/)).toBe(true);
    for (const other of ["gm-wait-tx-9", "gm-wait-tx-1x", "GM-WAIT-TX-1", "tx-1"]) {
      const v = edit(continuationRequest(), ["continues"], other);
      expect(parseGmWaitRequest(v).ok, other).toBe(false);
      expect(refusedByRule(v, /continue exactly its from_transaction/), other).toBe(true);
    }
    // the other way round: from_transaction moved away from a continues that was fine
    const moved = edit(continuationRequest(), ["gm_wait", "from_transaction"], "gm-wait-tx-9");
    expect(refusedByRule(moved, /continue exactly its from_transaction/)).toBe(true);
  });

  it("B0 refusal-only: a CONTINUATION whose transaction_id equals its from_transaction is refused (R46)", () => {
    expect(parseGmWaitRequest(continuationRequest()).ok).toBe(true);
    // one change: the new transaction takes the held one's identity, with the link still consistent
    const v = edit(continuationRequest(), ["transaction_id"], "gm-wait-tx-1");
    expect(parseGmWaitRequest(v).ok).toBe(false);
    expect(refusedByRule(v, /never the held one/)).toBe(true);
    // the same identity is no problem for an INITIAL, which has no held transaction
    expect(parseGmWaitRequest(edit(initialRequest(), ["transaction_id"], "gm-wait-tx-1")).ok).toBe(
      true,
    );
  });

  it("B0 refusal-only: the link versus a supplied held state is refused when there is none or it names another transaction (R47)", () => {
    const req = typed(continuationRequest());
    expect(gmContinuationLinkViolation(req, { from_transaction: "gm-wait-tx-1" })).toBeNull();
    expect(gmContinuationLinkViolation(req, null)).toMatch(/no continuation is held/);
    for (const other of ["gm-wait-tx-9", "gm-wait-tx-1x", "GM-WAIT-TX-1", ""])
      expect(gmContinuationLinkViolation(req, { from_transaction: other }), other).toMatch(
        /exactly the persisted continuation/,
      );
    // the link inside the request is checked too, whatever the held state says (these values do not pass the parser)
    const inner = { ...req, continues: "gm-wait-tx-9" };
    expect(gmContinuationLinkViolation(inner, { from_transaction: "gm-wait-tx-9" })).toMatch(
      /exactly its from_transaction/,
    );
    expect(gmContinuationLinkViolation(inner, { from_transaction: "gm-wait-tx-1" })).toMatch(
      /exactly its from_transaction/,
    );
    expect(
      gmContinuationLinkViolation(
        { ...req, continues: null },
        { from_transaction: "gm-wait-tx-1" },
      ),
    ).toMatch(/exactly its from_transaction/);
    // an INITIAL carries no link to a held transaction, so it is never consistent with a held state
    expect(
      gmContinuationLinkViolation(typed(initialRequest()), { from_transaction: "gm-wait-tx-1" }),
    ).toMatch(/only a CONTINUATION/);
  });
});

// ---------------------------------------------------------------------------------------------
// Sealed priors for the continuation-context rule
// ---------------------------------------------------------------------------------------------

/**
 * A sealed prior of branch U (unresolved dependents; requested target T1 and a null condition, carried forward unchanged) or branch R (a target
 * remainder TB..T1 and a stop condition that was satisfied; only the remainder target is consumed), under the given context.
 */
const sealedPrior = (branch: "U" | "R", context: Pair): Value => {
  const read = {
    mode: "AS-OF-NOW",
    source: { owner: SYNTH_OWNER, fact_key: SYNTH_SOURCE_KEY },
    invalidators: [{ fact_key: SYNTH_SOURCE_KEY }],
    source_basis: { version: 1, committed_by: "group-x" },
  };
  const stage = (s: typeof PRODUCER_STAGE | typeof CONSUMER_STAGE, n: number) => ({
    stage: s,
    reads: [read],
    group_id: `stage-group:${n}`,
    intent_id: `stage-intent:${n}`,
    revision: 10 + n,
    group_sha256: "a".repeat(64),
    writes: [{ key: "synthetic/k", version: 1 }],
    validation: { invariants: ["authority-present"] },
  });
  const common = {
    transaction_id: PRIOR_ID,
    cause: "cause-tx-prior",
    trigger: { kind: "fixture-advance-request", ref: "ref-prior" },
    continues: null,
    opening: { basis_time: at(100), state_version: 1 },
    context: { ...context },
    rule_versions: [
      {
        artifact: "a",
        native_pin: "p",
        clause: "c",
        authority_lineage: ["l"],
        effective_basis: "b",
        supersedes: null,
      },
    ],
  };
  if (branch === "R") {
    return {
      ...common,
      requested: stopAtBoundaryRequest().requested,
      engaged: [
        {
          boundary: "RETIRED",
          object_id: OBJECT_ENGAGED,
          fact_key: `temporal/object/${OBJECT_ENGAGED}`,
          version_before: 1,
          version_after: 2,
        },
      ],
      boundaries_crossed: [{ object_id: OBJECT_ENGAGED, boundary_id: BOUNDARY_ID, at: TB }],
      stages: [stage(PRODUCER_STAGE, 1), stage(CONSUMER_STAGE, 2)],
      outcome: {
        actual_stop: TB,
        stop_reason: "CONDITION_SATISFIED",
        remainder: { from: TB, to: T1 },
        unresolved_dependents: [],
      },
    };
  }
  return {
    ...common,
    requested: { target: T1, condition: null },
    engaged: [
      {
        boundary: "STILL_ACTIVE",
        object_id: OBJECT_ENGAGED,
        fact_key: `temporal/object/${OBJECT_ENGAGED}`,
        version_before: 1,
      },
    ],
    boundaries_crossed: [],
    stages: [stage(PRODUCER_STAGE, 1)],
    outcome: {
      actual_stop: TB,
      stop_reason: "DEPENDENCY_UNRESOLVED",
      remainder: null,
      unresolved_dependents: [{ stage: CONSUMER_STAGE, reason: "PREDECESSOR_BLOCKED" }],
    },
  };
};

const asSealed = (v: Value): ResolutionTransaction => v as unknown as ResolutionTransaction;

/** The current request that continues the prior: the player's resume (target T1, no condition) or the GM's CONTINUATION (target T1, null condition). */
const playerCurrent = (): Value => ({
  transaction_id: "tx-current",
  cause: "cause-tx-current",
  trigger: { kind: "fixture-advance-request", ref: "ref-current" },
  continues: PRIOR_ID,
  requested: { target: T1, condition: null },
  context: { ...PLAYER },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
});
const gmCurrent = (): Value => ({
  transaction_id: "tx-current",
  cause: "cause-tx-current",
  trigger: { kind: GM_INTERPRETED_PC_WAIT, ref: "ref-current" },
  continues: PRIOR_ID,
  requested: { target: { ...T1 }, condition: null },
  context: { ...GM },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  gm_wait: { phase: "CONTINUATION", from_transaction: PRIOR_ID },
});

/** The existing kernel predicate, called as the kernel calls it. */
const existing = (prior: Value, current: Value): string | null =>
  continuationRequestViolation(
    asSealed(prior),
    current["requested"] as ResolutionTransaction["requested"],
  );
const n1 = (prior: Value, current: Value): string | null =>
  continuationContextViolation(
    prior as unknown as { context: Pair },
    current as unknown as { context: Pair },
  );

const BRANCHES = ["U", "R"] as const;

describe("B0 refusal-only: the continuation context (N-1), on both branches of the existing predicate", () => {
  it("B0 refusal-only: the fixtures are what they claim to be: the player priors are sealed values, the currents are requests, and the branches differ", () => {
    for (const branch of BRANCHES) {
      expect(
        ResolutionTransactionSchema.safeParse(sealedPrior(branch, PLAYER)).success,
        branch,
      ).toBe(true);
      // the same fixture with only its context swapped is refused by the unchanged sealed schema, at the context alone
      const gmPrior = ResolutionTransactionSchema.safeParse(sealedPrior(branch, GM));
      expect(gmPrior.success, branch).toBe(false);
      expect(!gmPrior.success && gmPrior.error.issues.every((i) => i.path[0] === "context")).toBe(
        true,
      );
    }
    expect(ResolutionRequestSchema.safeParse(playerCurrent()).success).toBe(true);
    expect(parseGmWaitRequest(gmCurrent()).ok).toBe(true);
    // the branches are genuinely different: U carries unresolved dependents and no remainder, R the reverse
    const u = sealedPrior("U", PLAYER)["outcome"] as Value;
    const r = sealedPrior("R", PLAYER)["outcome"] as Value;
    expect((u["unresolved_dependents"] as unknown[]).length).toBeGreaterThan(0);
    expect(u["remainder"]).toBeNull();
    expect(r["unresolved_dependents"]).toEqual([]);
    expect(r["remainder"]).not.toBeNull();
    // and the existing predicate tells them apart: a changed condition breaks U (exact equality) and leaves R alone (target only)
    const withCondition = {
      ...playerCurrent(),
      requested: stopAtBoundaryRequest().requested,
    };
    expect(existing(sealedPrior("U", PLAYER), withCondition)).not.toBeNull();
    expect(existing(sealedPrior("R", PLAYER), withCondition)).toBeNull();
  });

  it("B0 refusal-only: N-1 on the U branch, player prior and GM current, is refused while continuationRequestViolation is null", () => {
    const prior = sealedPrior("U", PLAYER);
    // control, one change away (the current's context): the player's own resume has the same pair and no violation of either kind
    expect(n1(prior, playerCurrent())).toBeNull();
    expect(existing(prior, playerCurrent())).toBeNull();
    // the GM current has the identical requested predicate, so the existing rule finds nothing, and only N-1 refuses
    expect(existing(prior, gmCurrent())).toBeNull();
    expect(n1(prior, gmCurrent())).toMatch(/exactly the role and permission/);
  });

  it("B0 refusal-only: N-1 on the R branch, player prior and GM current, is refused while continuationRequestViolation is null", () => {
    const prior = sealedPrior("R", PLAYER);
    expect(n1(prior, playerCurrent())).toBeNull();
    expect(existing(prior, playerCurrent())).toBeNull();
    expect(existing(prior, gmCurrent())).toBeNull();
    expect(n1(prior, gmCurrent())).toMatch(/exactly the role and permission/);
  });

  it("B0 refusal-only: N-1 in reverse, GM prior and player current, is refused on U and on R, so a player cannot leave a GM-held wait", () => {
    for (const branch of BRANCHES) {
      const prior = sealedPrior(branch, GM);
      // control: the GM's own continuation of its own prior
      expect(n1(prior, gmCurrent()), branch).toBeNull();
      expect(existing(prior, gmCurrent()), branch).toBeNull();
      // the player's resume of the same prior satisfies the existing predicate and is refused by N-1 alone
      expect(existing(prior, playerCurrent()), branch).toBeNull();
      expect(n1(prior, playerCurrent()), branch).toMatch(/exactly the role and permission/);
    }
    // each member is compared on its own: a differing role alone, and a differing permission alone, are each refused
    const gm = { context: { ...GM } };
    expect(continuationContextViolation(gm, { context: { ...GM } })).toBeNull();
    expect(
      continuationContextViolation(gm, { context: { ...GM, role: "role.player" } }),
    ).not.toBeNull();
    expect(
      continuationContextViolation(gm, {
        context: { ...GM, permission: "permission.player_choice.commit" },
      }),
    ).not.toBeNull();
    // a context that is not a pair on either side is refused, never compared as equal by absence
    for (const bad of [
      undefined,
      null,
      {},
      { role: "role.gm" },
      { role: 1, permission: 2 },
      "role.gm",
    ])
      expect(
        continuationContextViolation(
          { context: bad as unknown as Pair },
          { context: bad as unknown as Pair },
        ),
        JSON.stringify(bad),
      ).not.toBeNull();
  });

  it("B0 refusal-only: with the same pair, a target or condition mismatch is still refused by continuationRequestViolation while N-1 finds nothing", () => {
    const moved = { unit: T1.unit, value: T1.value + 1 };
    for (const pair of [PLAYER, GM]) {
      const current = pair === PLAYER ? playerCurrent : gmCurrent;
      // U: the target moved, then the condition added; the existing predicate demands exact equality of both
      const u = sealedPrior("U", pair);
      const uTarget = { ...current(), requested: { target: moved, condition: null } };
      const uCondition = { ...current(), requested: stopAtBoundaryRequest().requested };
      for (const bad of [uTarget, uCondition]) {
        expect(n1(u, bad)).toBeNull();
        expect(existing(u, bad)).toMatch(
          /must preserve the original requested target and condition/,
        );
      }
      // R: only the remainder target matters; a different target is refused
      const r = sealedPrior("R", pair);
      const rTarget = { ...current(), requested: { target: moved, condition: null } };
      expect(n1(r, rTarget)).toBeNull();
      expect(existing(r, rTarget)).toMatch(/consume exactly the remainder/);
      // controls: the matching currents are clean on both rules
      expect(n1(u, current())).toBeNull();
      expect(existing(u, current())).toBeNull();
      expect(n1(r, current())).toBeNull();
      expect(existing(r, current())).toBeNull();
    }
    // both rules must be applied: a request that is wrong on both counts is refused by each, and neither hides the other
    for (const branch of BRANCHES) {
      const both = { ...gmCurrent(), requested: { target: moved, condition: null } };
      expect(n1(sealedPrior(branch, PLAYER), both)).not.toBeNull();
      expect(existing(sealedPrior(branch, PLAYER), both)).not.toBeNull();
    }
  });

  it("B0 shape control (not admission): with the same pair, a different trigger and cause give no N-1 refusal, because no trigger or cause equality is required", () => {
    // trigger kind, trigger ref, cause and publication all differ between the prior and each current below
    for (const branch of BRANCHES) {
      const currents: ReadonlyArray<readonly [Pair, Value]> = [
        [
          PLAYER,
          {
            ...playerCurrent(),
            trigger: { kind: "other-kind", ref: "other-ref" },
            cause: "other-cause",
            publication: { basis: "b2", secrecy: "s2" },
          },
        ],
        [
          GM,
          {
            ...gmCurrent(),
            trigger: { kind: GM_INTERPRETED_PC_WAIT, ref: "other-ref" },
            cause: "other-cause",
            publication: { basis: "b2", secrecy: "s2" },
          },
        ],
      ];
      for (const [pair, current] of currents) {
        const prior = sealedPrior(branch, pair);
        const p = prior["trigger"] as Value;
        const c = current["trigger"] as Value;
        expect(`${p["kind"]}/${p["ref"]}` === `${c["kind"]}/${c["ref"]}`).toBe(false);
        expect(prior["cause"]).not.toBe(current["cause"]);
        expect(n1(prior, current), `${branch} ${pair.role}`).toBeNull();
        // one change away from the refusal: the same prior and current with only the current's role changed
        const flipped = {
          ...current,
          context: { ...(current["context"] as Pair), role: "role.other" },
        };
        expect(n1(prior, flipped), `${branch} ${pair.role} flipped`).not.toBeNull();
      }
    }
  });
});

describe("B0 refusal-only: same-identity conflicts", () => {
  /** Every leaf of a plain value as a dotted path, in key order. */
  const leaves = (v: unknown, prefix = ""): string[] =>
    typeof v === "object" && v !== null
      ? Object.entries(v).flatMap(([k, c]) => leaves(c, prefix ? `${prefix}.${k}` : k))
      : [prefix];
  const at = (v: unknown, path: string): unknown =>
    path.split(".").reduce((n, k) => (n as Value)[k], v);
  /** A copy with the leaf at `path` replaced by something different of the same general kind. */
  const changedAt = (base: Value, path: string): Value => {
    const old = at(base, path);
    const next =
      typeof old === "number" ? old + 1 : typeof old === "string" ? `${old}~` : "changed";
    return edit(base, path.split("."), next);
  };
  const reordered = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(reordered)
      : typeof v === "object" && v !== null
        ? Object.fromEntries(
            Object.entries(v)
              .reverse()
              .map(([k, c]) => [k, reordered(c)]),
          )
        : v;

  const INITIAL_LEAVES = [
    "transaction_id",
    "cause",
    "trigger.kind",
    "trigger.ref",
    "continues",
    "requested.target.unit",
    "requested.target.value",
    "requested.condition",
    "context.role",
    "context.permission",
    "publication.basis",
    "publication.secrecy",
    "gm_wait.phase",
    "gm_wait.duration_value",
    "gm_wait.duration_unit",
    "gm_wait.observed_basis.unit",
    "gm_wait.observed_basis.value",
    "gm_wait.interpretation_mode",
    "gm_wait.conversion_rule_version",
    "gm_wait.catalogue_sha256",
  ];
  const CONTINUATION_LEAVES = [
    "transaction_id",
    "cause",
    "trigger.kind",
    "trigger.ref",
    "continues",
    "requested.target.unit",
    "requested.target.value",
    "requested.condition",
    "context.role",
    "context.permission",
    "publication.basis",
    "publication.secrecy",
    "gm_wait.phase",
    "gm_wait.from_transaction",
  ];

  it("B0 refusal-only: a same-ID INITIAL with any single field changed conflicts, and an identical one does not (R50)", () => {
    const base = typed(initialRequest());
    // the field list is the whole request: a new field would change it, and this test would say so
    expect(leaves(base)).toEqual(INITIAL_LEAVES);
    // controls: an identical copy, and the same members in another key order, do not conflict
    expect(gmWaitSameIdConflict(base, typed(initialRequest()))).toBe(false);
    expect(gmWaitSameIdConflict(base, reordered(base) as GmWaitRequestShape)).toBe(false);
    for (const path of INITIAL_LEAVES) {
      const changed = changedAt(base as unknown as Value, path) as unknown as GmWaitRequestShape;
      expect(gmWaitSameIdConflict(base, changed), path).toBe(true);
      expect(gmWaitSameIdConflict(changed, base), `${path} reversed`).toBe(true);
    }
    // a member added, a member dropped, and a value that cannot be canonicalized all conflict
    expect(gmWaitSameIdConflict(base, { ...base, extra: 1 } as unknown as GmWaitRequestShape)).toBe(
      true,
    );
    const withoutCause = Object.fromEntries(Object.entries(base).filter(([k]) => k !== "cause"));
    expect(gmWaitSameIdConflict(base, withoutCause as unknown as GmWaitRequestShape)).toBe(true);
    expect(
      gmWaitSameIdConflict(base, { ...base, cause: undefined } as unknown as GmWaitRequestShape),
    ).toBe(true);
    expect(
      gmWaitSameIdConflict({ ...base, cause: undefined } as unknown as GmWaitRequestShape, base),
    ).toBe(true);
  });

  it("B0 refusal-only: a same-ID CONTINUATION with a changed link, target, context or trigger conflicts, and an identical one does not (R51)", () => {
    const base = typed(continuationRequest());
    expect(leaves(base)).toEqual(CONTINUATION_LEAVES);
    expect(gmWaitSameIdConflict(base, typed(continuationRequest()))).toBe(false);
    expect(gmWaitSameIdConflict(base, reordered(base) as GmWaitRequestShape)).toBe(false);
    for (const path of CONTINUATION_LEAVES) {
      const changed = changedAt(base as unknown as Value, path) as unknown as GmWaitRequestShape;
      expect(gmWaitSameIdConflict(base, changed), path).toBe(true);
      expect(gmWaitSameIdConflict(changed, base), `${path} reversed`).toBe(true);
    }
    // the four named kinds of change, spelled out: the link (both places), the target, the context, the trigger
    const named: ReadonlyArray<readonly [string, Value]> = [
      [
        "link in gm_wait",
        edit(continuationRequest(), ["gm_wait", "from_transaction"], "gm-wait-tx-9"),
      ],
      ["link in continues", edit(continuationRequest(), ["continues"], "gm-wait-tx-9")],
      ["target", edit(continuationRequest(), ["requested", "target", "value"], 1121)],
      ["context", edit(continuationRequest(), ["context"], { ...PLAYER })],
      [
        "trigger",
        edit(continuationRequest(), ["trigger"], {
          kind: "direct-observation",
          ref: "ref-gm-wait-2",
        }),
      ],
    ];
    for (const [name, changed] of named)
      expect(gmWaitSameIdConflict(base, changed as unknown as GmWaitRequestShape), name).toBe(true);
    // and the INITIAL and the CONTINUATION of the same identity are not the same request (the comparator takes values; this one is not a parseable CONTINUATION)
    const sameId = { ...base, transaction_id: "gm-wait-tx-1" } as unknown as GmWaitRequestShape;
    expect(gmWaitSameIdConflict(typed(initialRequest()), sameId)).toBe(true);
  });
});
