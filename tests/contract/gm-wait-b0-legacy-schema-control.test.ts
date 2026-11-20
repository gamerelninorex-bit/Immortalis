// B0-26 — legacy schema control for F-014B package B0 (docs/f014b/b0-gm-request-contract.md §2.3, §4 R01 / R06 / R12, §7; P3, P4, P9).
//
// This suite CHARACTERIZES EXISTING BEHAVIOUR ONLY. It is preparatory work under BLUE's 20 Nov 2026 gate interpretation (Issue #114,
// "Direct A0/B0 Source Decisions", native pin 2026-11-20T00:15:08.470Z: independent tests of presently existing code may be written now).
// It implements nothing: it adds no schema, module, writer, interface, rule, registry entry, pin or conformance expectation, and it
// changes no file under packages/ or apps/. It is no B1 positive and no T0 PASS, and it claims no source-qualified engine transaction.
//
// What it records about the exported schemas of packages/contracts/src/temporal.ts, unchanged since commit 0c9e74b:
//   - ResolutionRequestSchema, TransactionAuthoritySchema and ResolutionTransactionSchema refuse the GM pair
//     {role:"role.gm", permission:"permission.rule.adjudicate"} with the provisional source trigger GM_INTERPRETED_PC_WAIT and with
//     every statically located existing trigger kind, and the refusal is located at `context` alone;
//   - each refuses a `gm_wait` key in any form, including `gm_wait: null` and an own `gm_wait: undefined`, on an otherwise accepted
//     player-origin value (strict objects: "absent, not null", v0.6 §4);
//   - the same five-field pick the legacy binders build at module load refuses the GM pair too.
// Every refusal is paired with an accepted control that differs from it by exactly one change, so no negative is tautological.
// The player pair with GM_INTERPRETED_PC_WAIT is ACCEPTED by the legacy schemas today (R06): that deny is additive and is not B0's.
import { describe, expect, it } from "vitest";
import {
  GM_ADJUDICATION_AUTHORITY,
  OBSERVATION_TRIGGER_KIND,
  PLAYER_CHOICE_AUTHORITY,
  ResolutionRequestSchema,
  ResolutionTransactionSchema,
  TransactionAuthoritySchema,
} from "@immortalis/contracts";
import {
  BOUNDARY_ID,
  CONSUMER_STAGE,
  OBJECT_ENGAGED,
  PRODUCER_STAGE,
  SYNTH_OWNER,
  SYNTH_SOURCE_KEY,
  T0,
  TB,
  T1,
  stopAtBoundaryRequest,
} from "@immortalis/testkit";

/** OSQ-1: the one provisional wire trigger, source-verbatim. It exists in no code; it is a plain string here. */
const GM_INTERPRETED_PC_WAIT = "GM_INTERPRETED_PC_WAIT";

/** v0.6 §3: the GM pair, written out literally and anchored to the existing constant (contracts/src/culture-adjudication.ts:31–34). */
const GM_PAIR = { role: "role.gm", permission: "permission.rule.adjudicate" } as const;
const PLAYER_PAIR = { role: "role.player", permission: "permission.player_choice.commit" } as const;

/** Every existing trigger kind located statically (B0 contract §3). `trigger.kind` is an open Id, so this is a lower bound. */
const EXISTING_TRIGGER_KINDS = [
  OBSERVATION_TRIGGER_KIND, // contracts/src/epistemic-access.ts:343 ("direct-observation")
  "operator-progression-choice", // operator/src/commands.ts:563
  "operator-null-pc-advance-choice", // operator/src/commands.ts:696
  "operator-null-pc-resume-choice", // operator/src/commands.ts:696
  "operator-pc-target-advance-choice", // operator/src/commands.ts:894
  "operator-pc-target-resume-choice", // operator/src/commands.ts:894
  "fixture-advance-request", // testkit/src/temporal-fixtures.ts:304, :318
  // the test-support kinds the legacy binders' own suites state
  "player-advance-choice", // tests/support/protocol-advance.ts:46
  "player-ooc-advance-choice", // tests/support/null-pc-advance.ts:77
  "player-pc-target-choice", // tests/support/pc-target-advance.ts:64
  "fixture-continue", // tests/integration/economy-foundation.test.ts:384
] as const;

type Value = Record<string, unknown>;

/** The accepted request: the existing testkit fixture, unchanged (tests/contract/temporal-schemas.test.ts:353). */
const request = (): Value => ({ ...stopAtBoundaryRequest() });

/** The accepted durable open authority: the request's fields plus the opening basis, as the kernel records it. */
const authority = (): Value => {
  const r = stopAtBoundaryRequest();
  return {
    transaction_id: r.transaction_id,
    cause: r.cause,
    trigger: r.trigger,
    continues: r.continues,
    opening: { basis_time: T0, state_version: 1 },
    requested: r.requested,
    context: r.context,
    publication: r.publication,
  };
};

/** The accepted sealed transaction, built exactly as tests/contract/temporal-schemas.test.ts:395–441 builds it. */
const transaction = (): Value => {
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
  return {
    transaction_id: "tx-1",
    cause: "cause-tx-1",
    trigger: { kind: "fixture-advance-request", ref: "ref-1" },
    continues: null,
    opening: { basis_time: T0, state_version: 1 },
    requested: stopAtBoundaryRequest().requested,
    context: { ...PLAYER_PAIR },
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
    outcome: {
      actual_stop: TB,
      stop_reason: "CONDITION_SATISFIED",
      remainder: { from: TB, to: T1 },
      unresolved_dependents: [],
    },
  };
};

interface Schema {
  safeParse(v: unknown): {
    success: boolean;
    error?: { issues: ReadonlyArray<{ code: string; path: PropertyKey[]; keys?: string[] }> };
  };
}

const SCHEMAS: ReadonlyArray<readonly [string, Schema, () => Value]> = [
  ["ResolutionRequestSchema", ResolutionRequestSchema, request],
  ["TransactionAuthoritySchema", TransactionAuthoritySchema, authority],
  ["ResolutionTransactionSchema", ResolutionTransactionSchema, transaction],
];

/** One change: the trigger kind (the reference is kept). */
const withTrigger = (v: Value, kind: string): Value => ({
  ...v,
  trigger: { ...(v["trigger"] as Value), kind },
});
/** One change: the context pair. */
const withContext = (v: Value, context: object): Value => ({ ...v, context: { ...context } });

const accepted = (schema: Schema, v: unknown): boolean => schema.safeParse(v).success;
/** The refusal's issues, every one of which must lie under `member` (so nothing else in the value is what was refused). */
const refusedAt = (schema: Schema, v: unknown, member: string): boolean => {
  const r = schema.safeParse(v);
  return (
    !r.success &&
    (r.error?.issues.length ?? 0) > 0 &&
    (r.error?.issues ?? []).every((i) => i.path[0] === member)
  );
};

describe("B0 refusal-only (legacy control): B0-26, the unchanged legacy Temporal schemas", () => {
  it("B0 refusal-only (legacy control): the literal GM and player pairs are the existing constants, and the base values are accepted", () => {
    expect(GM_PAIR).toEqual(GM_ADJUDICATION_AUTHORITY);
    expect(PLAYER_PAIR).toEqual(PLAYER_CHOICE_AUTHORITY);
    for (const [name, schema, base] of SCHEMAS) {
      expect(accepted(schema, base()), name).toBe(true);
      expect(base()["context"], name).toEqual(PLAYER_PAIR);
    }
  });

  it("B0 refusal-only (legacy control): each schema refuses the GM pair with GM_INTERPRETED_PC_WAIT, at context alone", () => {
    for (const [name, schema, base] of SCHEMAS) {
      const playerWithGmTrigger = withTrigger(base(), GM_INTERPRETED_PC_WAIT);
      // control (R06): today the legacy schema accepts the player pair with this trigger; only the context differs below
      expect(accepted(schema, playerWithGmTrigger), `${name} player pair control`).toBe(true);
      const gm = withContext(playerWithGmTrigger, GM_PAIR);
      expect(accepted(schema, gm), name).toBe(false);
      expect(refusedAt(schema, gm, "context"), name).toBe(true);
    }
  });

  it("B0 refusal-only (legacy control): each schema refuses the GM pair with every existing trigger kind, at context alone", () => {
    for (const [name, schema, base] of SCHEMAS)
      for (const kind of EXISTING_TRIGGER_KINDS) {
        const player = withTrigger(base(), kind);
        expect(accepted(schema, player), `${name} ${kind} player pair control`).toBe(true);
        const gm = withContext(player, GM_PAIR);
        expect(accepted(schema, gm), `${name} ${kind}`).toBe(false);
        expect(refusedAt(schema, gm, "context"), `${name} ${kind}`).toBe(true);
      }
  });

  it("B0 refusal-only (legacy control): each schema refuses a gm_wait key in any form on an accepted player-origin value, including null and an own undefined", () => {
    const initialLike = {
      phase: "INITIAL",
      duration_value: 3,
      duration_unit: "second",
      observed_basis: { unit: "second", value: 100 },
      interpretation_mode: "EXPLICIT_DURATION",
      conversion_rule_version: "SI_SUBDAY_V1",
      catalogue_sha256: "a".repeat(64),
    };
    const continuationLike = { phase: "CONTINUATION", from_transaction: "tx-0" };
    const forms: ReadonlyArray<readonly [string, unknown]> = [
      ["null", null],
      ["undefined", undefined],
      ["an INITIAL-like object", initialLike],
      ["a CONTINUATION-like object", continuationLike],
      ["an empty object", {}],
      ["false", false],
      ["0", 0],
      ["an empty string", ""],
    ];
    for (const [name, schema, base] of SCHEMAS)
      for (const [label, value] of forms) {
        const v = { ...base(), gm_wait: value };
        // the key is genuinely present, even when its value is undefined
        expect(Object.hasOwn(v, "gm_wait"), `${name} ${label}`).toBe(true);
        const r = schema.safeParse(v);
        expect(r.success, `${name} gm_wait ${label}`).toBe(false);
        // the one refusal is the strict object's unrecognized key, at the top level
        expect(
          r.error?.issues.map((i) => [i.code, i.path, i.keys]),
          `${name} gm_wait ${label}`,
        ).toEqual([["unrecognized_keys", [], ["gm_wait"]]]);
      }
  });

  it("B0 refusal-only (legacy control): the five-field pick the legacy binders build at load accepts the player pair and refuses the GM pair", () => {
    // the same expression as protocol/src/active-pc-target-advance.ts:137–143, null-pc-ooc-advance.ts:98–104,
    // null-pc-ooc-held-continuation.ts:104–110 and pc-transfer-advance.ts:94–100 (and operator/src/ledger.ts:62–68)
    const picked = ResolutionRequestSchema.pick({
      transaction_id: true,
      cause: true,
      trigger: true,
      context: true,
      publication: true,
    });
    const r = stopAtBoundaryRequest();
    const stated: Value = {
      transaction_id: r.transaction_id,
      cause: r.cause,
      trigger: r.trigger,
      context: r.context,
      publication: r.publication,
    };
    expect(accepted(picked, stated)).toBe(true);
    for (const kind of [GM_INTERPRETED_PC_WAIT, ...EXISTING_TRIGGER_KINDS]) {
      const player = withTrigger(stated, kind);
      expect(accepted(picked, player), `${kind} player pair control`).toBe(true);
      expect(refusedAt(picked, withContext(player, GM_PAIR), "context"), kind).toBe(true);
    }
    expect(accepted(picked, { ...stated, gm_wait: null })).toBe(false);
  });
});
