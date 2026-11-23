/* eslint-disable @typescript-eslint/no-explicit-any -- negatives are built by corrupting one field of a valid control */
// F-014B B2 — the strict prospective GM-wait contracts (packages/contracts/src/temporal-custody.ts). CONTRACT SHAPE ONLY: these tests
// judge strictness, cardinality and the separation from the legacy player-origin shapes. They claim nothing about admission or a live wait.
//
// Design rule: every negative is ONE change from an accepted control, so a refusal is attributable to exactly that change.
import { describe, expect, it } from "vitest";
import {
  GM_WAIT_CONTEXT,
  GM_WAIT_ORIGIN,
  GM_ADJUDICATION_AUTHORITY,
  GmWaitByPcIndexSchema,
  GmWaitMarkerSchema,
  GmWaitResolutionTransactionSchema,
  GmWaitTransactionAuthoritySchema,
  ResolutionTransactionSchema,
  ResolutionTransactionStoredSchema,
  TransactionAuthoritySchema,
  TransactionAuthorityStoredSchema,
  temporalGmWaitByPcKey,
  temporalGmWaitMarkerKey,
} from "@immortalis/contracts";
import {
  GM_INTERPRETED_PC_WAIT,
  GmWaitContextSchema,
} from "../../packages/contracts/src/temporal-gm-wait.ts"; // the merged B0 module; unexported from the contracts index

const X = "a".repeat(64);
const TX = `gm-wait:${X}`;
const PUB = { basis: "fixture-basis", secrecy: "fixture-visibility" };
const TIME = { unit: "fixture-time-unit", value: 100 };
const TARGET = { unit: "fixture-time-unit", value: 160 };
const RULE = {
  artifact: "a",
  native_pin: "p",
  clause: "c",
  authority_lineage: ["l"],
  effective_basis: "e",
  supersedes: null,
};
const REF = (key: string) => ({ key, version: 1, group_id: `group-of-${key}` });

const marker = (): any => ({
  schema_version: 1,
  origin: GM_WAIT_ORIGIN,
  x: X,
  campaign_id: "campaign-1",
  pc_id: "pc-1",
  pc_binding: {
    key: "role/player-character/binding",
    version: 1,
    provenance_group_id: "g-binding",
  },
  original: {
    session_ref_sha256: "b".repeat(64),
    rpc_id_serialized_sha256: "c".repeat(64),
    authenticated_host_ref_sha256: "d".repeat(64),
  },
  initial_request_sha256: "e".repeat(64),
  request: {
    cause: "cause-1",
    trigger: { kind: GM_WAIT_ORIGIN, ref: "ref-1" },
    requested: { target: TARGET, condition: null },
    gm_context: { ...GM_WAIT_CONTEXT },
    publication: { ...PUB },
  },
  policy: {
    catalogue_sha256: "f".repeat(64),
    source_rule_ref: RULE,
    history_verification_id: "id-1",
  },
  preparation: {
    kind: "OWNER_PENDING_ENROLMENT",
    owner: "owner-1",
    fact: { key: "k/a", version: 1, group_id: "g-a" },
    digest: "9".repeat(64),
  },
  basis: {
    canonical_time: TIME,
    state_version: 1,
    read_witnesses: [
      { key: "a/key", version: 1, group_id: "g1" },
      { key: "b/key", version: 2, group_id: "g2" },
    ],
    absent_witnesses: [{ key: "c/key" }, { key: "d/key" }],
  },
  original_publication: { group_id: "g-m", intent_id: "i-m", cause: "gm-wait:x" },
});

const indexCommon = () => ({
  schema_version: 1,
  campaign_id: "campaign-1",
  pc_id: "pc-1",
  x: X,
  marker: REF(temporalGmWaitMarkerKey(X)),
  predecessor_index_version: 0,
});
const indexOf = (state: string): any => {
  const c = indexCommon();
  switch (state) {
    case "MARKED":
      return { ...c, state, open_authority: null, sealed_result: null, terminal_proof: null };
    case "OPEN":
      return {
        ...c,
        state,
        open_authority: REF("auth"),
        sealed_result: null,
        terminal_proof: null,
      };
    case "NO_OPEN":
      return {
        ...c,
        state,
        open_authority: null,
        sealed_result: null,
        terminal_proof: { absent: [{ key: "auth" }, { key: "seal" }], at_revision: 7 },
      };
    default:
      return {
        ...c,
        state,
        open_authority: REF("auth"),
        sealed_result: REF("seal"),
        terminal_proof: null,
      };
  }
};

const without = (o: any, k: string) => {
  const { [k]: _, ...rest } = o;
  void _;
  return rest;
};
const authority = (): any => ({
  origin: GM_WAIT_ORIGIN,
  x: X,
  transaction_id: TX,
  cause: "cause-1",
  trigger: { kind: GM_WAIT_ORIGIN, ref: "ref-1" },
  continues: null,
  opening: { basis_time: TIME, state_version: 1 },
  requested: { target: TARGET, condition: null },
  context: { ...GM_WAIT_CONTEXT },
  publication: { ...PUB },
});
const seal = (): any => ({
  ...without(authority(), "publication"), // the seal repeats the opening's fields; its publication labels are carried by the written fact
  engaged: [],
  boundaries_crossed: [],
  stages: [],
  rule_versions: [],
  outcome: {
    actual_stop: TARGET,
    stop_reason: "TARGET_REACHED",
    remainder: null,
    unresolved_dependents: [],
  },
});
const legacyAuthority = (): any => ({
  transaction_id: "tx-legacy-1",
  cause: "cause-1",
  trigger: { kind: "operator-progression-choice", ref: "ref-1" },
  continues: null,
  opening: { basis_time: TIME, state_version: 1 },
  requested: { target: TARGET, condition: null },
  context: { role: "role.player", permission: "permission.player_choice.commit" },
  publication: { ...PUB },
});
const legacySeal = (): any => {
  const { publication: _p, ...a } = legacyAuthority();
  void _p;
  return {
    ...a,
    engaged: [],
    boundaries_crossed: [],
    stages: [],
    rule_versions: [],
    outcome: {
      actual_stop: TARGET,
      stop_reason: "TARGET_REACHED",
      remainder: null,
      unresolved_dependents: [],
    },
  };
};

describe("[pin] the literals the engine states locally equal their sources", () => {
  it("the GM origin discriminator is the B0 trigger literal", () => {
    expect(GM_WAIT_ORIGIN).toBe(GM_INTERPRETED_PC_WAIT);
  });
  it("the GM pair is the culture-adjudication pair (stated here because that module imports temporal.ts) and B0's own schema accepts it", () => {
    expect(GM_WAIT_CONTEXT).toEqual({ ...GM_ADJUDICATION_AUTHORITY });
    expect(GmWaitContextSchema.safeParse(GM_WAIT_CONTEXT).success).toBe(true);
  });
});

describe("[control] the legacy player-origin shapes are untouched and the GM variants are separate members", () => {
  it("accepted controls: the legacy authority and seal parse under the legacy schemas, the GM ones under the GM schemas", () => {
    expect(TransactionAuthoritySchema.safeParse(legacyAuthority()).success).toBe(true);
    expect(ResolutionTransactionSchema.safeParse(legacySeal()).success).toBe(true);
    expect(GmWaitTransactionAuthoritySchema.safeParse(authority()).success).toBe(true);
    expect(GmWaitResolutionTransactionSchema.safeParse(seal()).success).toBe(true);
  });
  it("a GM-origin value never parses as a legacy one, and a legacy value never parses as a GM one (no widening either way)", () => {
    expect(TransactionAuthoritySchema.safeParse(authority()).success).toBe(false);
    expect(ResolutionTransactionSchema.safeParse(seal()).success).toBe(false);
    expect(GmWaitTransactionAuthoritySchema.safeParse(legacyAuthority()).success).toBe(false);
    expect(GmWaitResolutionTransactionSchema.safeParse(legacySeal()).success).toBe(false);
  });
  it("the stored unions accept both origins, and every legacy value parses to exactly what the legacy schema returns", () => {
    expect(TransactionAuthorityStoredSchema.parse(legacyAuthority())).toEqual(
      TransactionAuthoritySchema.parse(legacyAuthority()),
    );
    expect(ResolutionTransactionStoredSchema.parse(legacySeal())).toEqual(
      ResolutionTransactionSchema.parse(legacySeal()),
    );
    expect(TransactionAuthorityStoredSchema.safeParse(authority()).success).toBe(true);
    expect(ResolutionTransactionStoredSchema.safeParse(seal()).success).toBe(true);
  });
  it("the GM pair is not the player pair, and a GM-origin value under the player pair is refused", () => {
    expect(
      GmWaitTransactionAuthoritySchema.safeParse({
        ...authority(),
        context: { role: "role.player", permission: "permission.player_choice.commit" },
      }).success,
    ).toBe(false);
  });
});

describe("the immutable marker", () => {
  it("[control] the accepted marker parses", () => {
    expect(GmWaitMarkerSchema.safeParse(marker()).success).toBe(true);
  });
  const corrupt: [string, (m: any) => any][] = [
    ["an unmodelled field", (m) => ({ ...m, extra: 1 })],
    ["a missing required member", (m) => without(m, "initial_request_sha256")],
    ["another origin literal", (m) => ({ ...m, origin: "gm_interpreted_pc_wait" })],
    ["an uppercase X", (m) => ({ ...m, x: "A".repeat(64) })],
    ["a short X", (m) => ({ ...m, x: "a".repeat(63) })],
    ["another schema version", (m) => ({ ...m, schema_version: 2 })],
    [
      "a non-null condition",
      (m) => ({
        ...m,
        request: {
          ...m.request,
          requested: {
            target: TARGET,
            condition: { kind: "STOP_AFTER_BOUNDARY", object_id: "o", boundary_id: "b" },
          },
        },
      }),
    ],
    [
      "a trigger of another kind",
      (m) => ({ ...m, request: { ...m.request, trigger: { kind: "other", ref: "r" } } }),
    ],
    [
      "the player context",
      (m) => ({
        ...m,
        request: {
          ...m.request,
          gm_context: { role: "role.player", permission: "permission.player_choice.commit" },
        },
      }),
    ],
    [
      "a raw credential member in the original block",
      (m) => ({ ...m, original: { ...m.original, session_id: "raw" } }),
    ],
    [
      "an unmodelled preparation member",
      (m) => ({ ...m, preparation: { ...m.preparation, extra: 1 } }),
    ],
    [
      "an unknown preparation kind",
      (m) => ({ ...m, preparation: { ...m.preparation, kind: "ASSERTED" } }),
    ],
    ["no read witness", (m) => ({ ...m, basis: { ...m.basis, read_witnesses: [] } })],
    [
      "witnesses out of order",
      (m) => ({
        ...m,
        basis: { ...m.basis, read_witnesses: [...m.basis.read_witnesses].reverse() },
      }),
    ],
    [
      "a duplicate witness key",
      (m) => ({
        ...m,
        basis: {
          ...m.basis,
          read_witnesses: [m.basis.read_witnesses[0], m.basis.read_witnesses[0]],
        },
      }),
    ],
    [
      "absence witnesses out of order",
      (m) => ({
        ...m,
        basis: { ...m.basis, absent_witnesses: [{ key: "d/key" }, { key: "c/key" }] },
      }),
    ],
    [
      "a witness at version 0",
      (m) => ({
        ...m,
        basis: { ...m.basis, read_witnesses: [{ key: "a/key", version: 0, group_id: "g" }] },
      }),
    ],
    [
      "a policy without its rule reference",
      (m) => ({ ...m, policy: without(m.policy, "source_rule_ref") }),
    ],
  ];
  for (const [what, make] of corrupt) {
    it(`[negative] ${what} is refused`, () => {
      expect(GmWaitMarkerSchema.safeParse(make(marker())).success).toBe(false);
    });
  }
});

describe("the by-PC index: field presence is strictly determined by its state", () => {
  for (const state of ["MARKED", "OPEN", "NO_OPEN", "SEALED_RECONCILED"]) {
    it(`[control] a ${state} index parses`, () => {
      expect(GmWaitByPcIndexSchema.safeParse(indexOf(state)).success).toBe(true);
    });
  }
  const negatives: [string, any][] = [
    ["MARKED with an opening authority", { ...indexOf("MARKED"), open_authority: REF("a") }],
    ["MARKED with a seal", { ...indexOf("MARKED"), sealed_result: REF("s") }],
    [
      "MARKED with a terminal proof",
      {
        ...indexOf("MARKED"),
        terminal_proof: { absent: [{ key: "a" }, { key: "b" }], at_revision: 1 },
      },
    ],
    ["OPEN without its authority", { ...indexOf("OPEN"), open_authority: null }],
    ["OPEN with a seal", { ...indexOf("OPEN"), sealed_result: REF("s") }],
    ["NO_OPEN without the negative certificate", { ...indexOf("NO_OPEN"), terminal_proof: null }],
    ["NO_OPEN with an opening authority", { ...indexOf("NO_OPEN"), open_authority: REF("a") }],
    ["NO_OPEN with a seal", { ...indexOf("NO_OPEN"), sealed_result: REF("s") }],
    [
      "a NO_OPEN certificate naming three absent keys",
      {
        ...indexOf("NO_OPEN"),
        terminal_proof: { absent: [{ key: "a" }, { key: "b" }, { key: "c" }], at_revision: 7 },
      },
    ],
    [
      "a NO_OPEN certificate at revision 0",
      {
        ...indexOf("NO_OPEN"),
        terminal_proof: { absent: [{ key: "a" }, { key: "b" }], at_revision: 0 },
      },
    ],
    [
      "SEALED_RECONCILED without its seal",
      { ...indexOf("SEALED_RECONCILED"), sealed_result: null },
    ],
    [
      "SEALED_RECONCILED without its authority",
      { ...indexOf("SEALED_RECONCILED"), open_authority: null },
    ],
    [
      "SEALED_RECONCILED with a terminal proof",
      {
        ...indexOf("SEALED_RECONCILED"),
        terminal_proof: { absent: [{ key: "a" }, { key: "b" }], at_revision: 1 },
      },
    ],
    [
      "a state outside the closed enum (a TTL / stale / PAUSED state)",
      { ...indexOf("MARKED"), state: "PAUSED" },
    ],
    [
      "a marker reference at version 2",
      { ...indexOf("MARKED"), marker: { ...REF("m"), version: 2 } },
    ],
    ["an unmodelled field", { ...indexOf("OPEN"), expires_at: 1 }],
    ["a mutable copy of the original request", { ...indexOf("OPEN"), request: {} }],
  ];
  for (const [what, value] of negatives) {
    it(`[negative] ${what} is refused`, () => {
      expect(GmWaitByPcIndexSchema.safeParse(value).success).toBe(false);
    });
  }
});

describe("the GM variants of the opening authority and the seal", () => {
  const authNegatives: [string, (a: any) => any][] = [
    ["a CONTINUATION (continues non-null)", (a) => ({ ...a, continues: "tx-1" })],
    [
      "a non-null condition",
      (a) => ({
        ...a,
        requested: {
          target: TARGET,
          condition: { kind: "STOP_AFTER_BOUNDARY", object_id: "o", boundary_id: "b" },
        },
      }),
    ],
    ["a null target", (a) => ({ ...a, requested: { target: null, condition: null } })],
    ["another trigger kind", (a) => ({ ...a, trigger: { kind: "other", ref: "r" } })],
    ["no X", (a) => without(a, "x")],
    ["no origin discriminator", (a) => without(a, "origin")],
  ];
  for (const [what, make] of authNegatives) {
    it(`[negative] a GM authority with ${what} is refused`, () => {
      expect(GmWaitTransactionAuthoritySchema.safeParse(make(authority())).success).toBe(false);
    });
  }
  const sealNegatives: [string, (s: any) => any][] = [
    [
      "a DEPENDENCY_UNRESOLVED stop (HELD/PAUSED/INTERRUPTED are S4 and not lowered)",
      (s) => ({
        ...s,
        outcome: {
          ...s.outcome,
          stop_reason: "DEPENDENCY_UNRESOLVED",
          unresolved_dependents: [
            {
              stage: {
                causal_process_id: "p",
                owner_operation: { owner: "o", operation: "op" },
                prospective_result_id: "r",
              },
              reason: "SOURCE_ABSENT",
            },
          ],
        },
      }),
    ],
    [
      "an unspent remainder",
      (s) => ({
        ...s,
        outcome: { ...s.outcome, actual_stop: TIME, remainder: { from: TIME, to: TARGET } },
      }),
    ],
    [
      "a stop that passes the target (the legacy cross-field rule still applies)",
      (s) => ({
        ...s,
        outcome: { ...s.outcome, actual_stop: { unit: "fixture-time-unit", value: 161 } },
      }),
    ],
    [
      "a stop that precedes the opening basis (the legacy cross-field rule still applies)",
      (s) => ({
        ...s,
        outcome: { ...s.outcome, actual_stop: { unit: "fixture-time-unit", value: 50 } },
      }),
    ],
    [
      "a TARGET_REACHED stop short of the target",
      (s) => ({
        ...s,
        outcome: { ...s.outcome, actual_stop: { unit: "fixture-time-unit", value: 150 } },
      }),
    ],
    [
      "a CONDITION_SATISFIED stop",
      (s) => ({ ...s, outcome: { ...s.outcome, stop_reason: "CONDITION_SATISFIED" } }),
    ],
  ];
  for (const [what, make] of sealNegatives) {
    it(`[negative] a GM seal with ${what} is refused`, () => {
      expect(GmWaitResolutionTransactionSchema.safeParse(make(seal())).success).toBe(false);
    });
  }
});

describe("keys", () => {
  it("the marker key is at the lowercase-hex address of its X and the index key at its PC", () => {
    expect(temporalGmWaitMarkerKey(X)).toBe(`temporal/gm-wait/marker/${X}`);
    expect(temporalGmWaitByPcKey("pc-1")).toBe("temporal/gm-wait/by-pc/pc-1");
  });
});
