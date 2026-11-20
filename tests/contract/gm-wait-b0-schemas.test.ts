// B0-01..B0-17 — strict GM waiting request shapes for F-014B package B0 (docs/f014b/b0-gm-request-contract.md §2.2, §2.3, §2.5, §4, §7).
//
// T1 mechanism component (BLUE v0.3 §4): strict request/refusal contract only; no B1 positive, no T0 PASS, no production capability; F-014B LC closures unchanged.
//
// What it exercises: the pure module packages/contracts/src/temporal-gm-wait.ts, imported by relative path (it is not exported from the package
// index). Every value is a plain object handed to a pure function; nothing is opened, written or read. A success below is a SHAPE verdict only:
// it says the value has the strict members the sources fix, never that a request was accepted, authorized or eligible. The fixture digest is a
// syntax-only specimen with no meaning, and the fixture unit "time-unit-fixture" is not an SI claim.
//
// Non-tautology. The shape controls (B0-01..03) establish that the base values parse. Every refusal test builds its specimen from a base by
// exactly one change, asserts the base is accepted first, and asserts WHICH stage refused: a shape refusal carries zod issues at the changed
// member and no pairing reason, so a refusal cannot come from some unrelated part of the value.
import { describe, expect, it } from "vitest";
import { GM_ADJUDICATION_AUTHORITY, PLAYER_CHOICE_AUTHORITY } from "@immortalis/contracts";
import {
  GM_INTERPRETED_PC_WAIT,
  GM_WAIT_DURATION_UNITS,
  GM_WAIT_INTERPRETATION_MODES,
  GmWaitContinuationSchema,
  GmWaitInitialSchema,
  GmWaitResolutionRequestShapeSchema,
  GmWaitSchema,
  SI_SUBDAY_V1,
  parseGmWaitRequest,
} from "../../packages/contracts/src/temporal-gm-wait.ts";

type Value = Record<string, unknown>;

const UNIT = "time-unit-fixture";
/** A syntax-only specimen: 64 lowercase hexadecimal characters. It identifies no catalogue and proves nothing. */
const DIGEST = "0123456789abcdef".repeat(4);
const OTHER_DIGEST = "fedcba9876543210".repeat(4);
const GM_PAIR = { role: "role.gm", permission: "permission.rule.adjudicate" } as const;
/** Independent restatement of the three conversion factors, used only to build consistent specimens. */
const FACTOR = { second: 1, minute: 60, hour: 3600 } as const;
const MISSING = Symbol("missing");

/** INITIAL specimen. The target is the independently computed derivation, so the base value is the arithmetic-consistent control. */
const initial = (
  o: {
    value?: number;
    unit?: keyof typeof FACTOR;
    basis?: { unit: string; value: number };
    mode?: string;
  } = {},
): Value => {
  const value = o.value ?? 2;
  const unit = o.unit ?? "minute";
  const basis = o.basis ?? { unit: UNIT, value: 1000 };
  return {
    transaction_id: "gm-wait-tx-1",
    cause: "cause-gm-wait-1",
    trigger: { kind: GM_INTERPRETED_PC_WAIT, ref: "ref-gm-wait-1" },
    continues: null,
    requested: {
      target: { unit: basis.unit, value: basis.value + value * FACTOR[unit] },
      condition: null,
    },
    context: { ...GM_PAIR },
    publication: { basis: "basis-label-1", secrecy: "secrecy-label-1" },
    gm_wait: {
      phase: "INITIAL",
      duration_value: value,
      duration_unit: unit,
      observed_basis: { ...basis },
      interpretation_mode: o.mode ?? "EXPLICIT_DURATION",
      conversion_rule_version: SI_SUBDAY_V1,
      catalogue_sha256: DIGEST,
    },
  };
};

const continuation = (): Value => ({
  transaction_id: "gm-wait-tx-2",
  cause: "cause-gm-wait-2",
  trigger: { kind: GM_INTERPRETED_PC_WAIT, ref: "ref-gm-wait-2" },
  continues: "gm-wait-tx-1",
  requested: { target: { unit: UNIT, value: 1120 }, condition: null },
  context: { ...GM_PAIR },
  publication: { basis: "basis-label-1", secrecy: "secrecy-label-1" },
  gm_wait: { phase: "CONTINUATION", from_transaction: "gm-wait-tx-1" },
});

/** A copy of `base` with exactly one thing changed: the value at `path` set, or removed when MISSING. */
const edit = (base: Value, path: readonly string[], value: unknown): Value => {
  const out = structuredClone(base);
  let node = out;
  for (const key of path.slice(0, -1)) node = node[key] as Value;
  const last = path[path.length - 1]!;
  if (value === MISSING) delete node[last];
  else node[last] = value;
  return out;
};

const accepted = (v: unknown): boolean => parseGmWaitRequest(v).ok;

/** A readable label for a specimen value in an assertion message. */
const lbl = (x: unknown): string =>
  typeof x === "symbol"
    ? "missing"
    : Object.is(x, -0)
      ? "-0"
      : typeof x === "number" || typeof x === "undefined"
        ? String(x)
        : JSON.stringify(x);

/** The zod issues the shape stage reported, "path: message", or null when the parser did not refuse at the shape stage. */
const shapeIssues = (v: unknown): string[] | null => {
  const r = parseGmWaitRequest(v);
  if (r.ok || r.error.code !== "INPUT_INVALID" || r.error.details?.["reason"] !== undefined)
    return null;
  const issues = r.error.details?.["issues"];
  return Array.isArray(issues) ? (issues as string[]) : null;
};

/** The shape stage refused, with at least one issue at (or under) `at` ("" is the envelope itself) and no pairing reason. */
const refusedByShapeAt = (v: unknown, at: string): boolean =>
  (shapeIssues(v) ?? []).some((i) =>
    at === "" ? i.startsWith(":") : i.startsWith(`${at}:`) || i.startsWith(`${at}.`),
  );

const INITIAL_MEMBERS = [
  "phase",
  "duration_value",
  "duration_unit",
  "observed_basis",
  "interpretation_mode",
  "conversion_rule_version",
  "catalogue_sha256",
] as const;

describe("B0 shape control (not admission): the strict specimens parse", () => {
  it("B0 shape control (not admission): the P1a specimen (basis second:100, 3 second, target 103) parses, as an unaliased copy", () => {
    const p1a = initial({ value: 3, unit: "second", basis: { unit: "second", value: 100 } });
    expect((p1a["requested"] as Value)["target"]).toEqual({ unit: "second", value: 103 });
    // a deeply frozen input proves the parser neither mutates nor retains the caller's object
    const deepFreeze = (v: unknown): void => {
      if (typeof v === "object" && v !== null) {
        Object.freeze(v);
        for (const c of Object.values(v)) deepFreeze(c);
      }
    };
    const frozen = structuredClone(p1a);
    deepFreeze(frozen);
    const r = parseGmWaitRequest(frozen);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual(p1a);
      expect(r.value).not.toBe(frozen);
      expect(r.value.gm_wait).not.toBe((frozen as Value)["gm_wait"]);
    }
    // the specimen of the construction brief: exact GM pair and trigger, 2 minute, basis 1000, target 1120, continues null, condition null
    const brief = initial();
    expect(brief["continues"]).toBeNull();
    expect((brief["requested"] as Value)["target"]).toEqual({ unit: UNIT, value: 1120 });
    expect((brief["requested"] as Value)["condition"]).toBeNull();
    expect(accepted(brief)).toBe(true);
  });

  it("B0 shape control (not admission): the P1b specimen (10 minute, target 700) parses, and so does every duration unit and interpretation mode", () => {
    const p1b = initial({ value: 10, unit: "minute", basis: { unit: "second", value: 100 } });
    expect((p1b["requested"] as Value)["target"]).toEqual({ unit: "second", value: 700 });
    expect(accepted(p1b)).toBe(true);
    for (const unit of GM_WAIT_DURATION_UNITS) expect(accepted(initial({ unit })), unit).toBe(true);
    for (const mode of GM_WAIT_INTERPRETATION_MODES)
      expect(accepted(initial({ mode })), mode).toBe(true);
  });

  it("B0 shape control (not admission): a CONTINUATION with continues equal to from_transaction parses, and the envelope schema can still be picked", () => {
    expect(accepted(continuation())).toBe(true);
    // no object-level refinement: a later consumer may still pick members from the envelope schema
    const picked = GmWaitResolutionRequestShapeSchema.pick({
      transaction_id: true,
      cause: true,
      trigger: true,
      context: true,
      publication: true,
    });
    const v = initial();
    expect(
      picked.safeParse({
        transaction_id: v["transaction_id"],
        cause: v["cause"],
        trigger: v["trigger"],
        context: v["context"],
        publication: v["publication"],
      }).success,
    ).toBe(true);
    // the variants and their members are exactly the ones the sources fix: seven for INITIAL, two for CONTINUATION, two variants
    expect(Object.keys(GmWaitInitialSchema.shape).sort()).toEqual([...INITIAL_MEMBERS].sort());
    expect(Object.keys(GmWaitContinuationSchema.shape).sort()).toEqual([
      "from_transaction",
      "phase",
    ]);
    expect(GmWaitSchema.options.map((o) => o.shape.phase.value).sort()).toEqual([
      "CONTINUATION",
      "INITIAL",
    ]);
    expect(GM_ADJUDICATION_AUTHORITY).toEqual(GM_PAIR);
  });
});

describe("B0 refusal-only: the INITIAL variant is closed", () => {
  it("B0 refusal-only: each of the seven INITIAL members missing is refused (R26, R21-R25)", () => {
    expect(accepted(initial())).toBe(true);
    for (const member of INITIAL_MEMBERS) {
      const v = edit(initial(), ["gm_wait", member], MISSING);
      expect(accepted(v), member).toBe(false);
      // a missing discriminator is refused at the variant union; any other member at that member
      expect(
        refusedByShapeAt(v, member === "phase" ? "gm_wait" : `gm_wait.${member}`),
        member,
      ).toBe(true);
    }
  });

  it("B0 refusal-only: an unmodelled INITIAL member is refused, among them an evaluator version (R31)", () => {
    expect(accepted(initial())).toBe(true);
    for (const extra of [
      "target",
      "from_transaction",
      "evaluator_policy_version",
      "evaluator_version",
      "calendar",
      "pending_verdict",
      "origin_witness",
    ]) {
      const v = edit(initial(), ["gm_wait", extra], "x");
      expect(accepted(v), extra).toBe(false);
      expect(refusedByShapeAt(v, "gm_wait"), extra).toBe(true);
      // even an explicit undefined is still an unknown key under a strict object
      const withUndefined = edit(initial(), ["gm_wait", extra], undefined);
      expect(Object.hasOwn(withUndefined["gm_wait"] as Value, extra)).toBe(true);
      expect(accepted(withUndefined), `${extra} (undefined)`).toBe(false);
    }
    expect(Object.keys(GmWaitInitialSchema.shape)).not.toContain("evaluator_version");
  });

  it("B0 refusal-only: a non-positive, non-integer, coerced or unsafe duration_value is refused (R21)", () => {
    expect(accepted(initial({ value: 1 }))).toBe(true);
    expect(
      accepted(
        initial({ value: 150119987579016, unit: "minute", basis: { unit: UNIT, value: 0 } }),
      ),
    ).toBe(true);
    for (const bad of [
      0,
      -1,
      -0,
      1.5,
      "3",
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      2 ** 53,
      Number.MAX_SAFE_INTEGER + 2,
      null,
      true,
      [3],
      {},
      MISSING,
    ]) {
      const v = edit(initial(), ["gm_wait", "duration_value"], bad);
      expect(accepted(v), lbl(bad)).toBe(false);
      expect(refusedByShapeAt(v, "gm_wait.duration_value"), lbl(bad)).toBe(true);
    }
  });

  it("B0 refusal-only: a plural, abbreviated, cased, calendar or unknown duration_unit is refused (R22)", () => {
    for (const unit of GM_WAIT_DURATION_UNITS) expect(accepted(initial({ unit })), unit).toBe(true);
    for (const bad of [
      "minutes",
      "seconds",
      "hours",
      "Minute",
      "SECOND",
      "min",
      "s",
      "h",
      "day",
      "week",
      "month",
      "year",
      "sunrise",
      "turn",
      " minute",
      "minute ",
      "",
      null,
      1,
      MISSING,
    ]) {
      const v = edit(initial(), ["gm_wait", "duration_unit"], bad);
      expect(accepted(v), lbl(bad)).toBe(false);
      expect(refusedByShapeAt(v, "gm_wait.duration_unit"), lbl(bad)).toBe(true);
    }
  });

  it("B0 refusal-only: an unknown interpretation_mode is refused (R24)", () => {
    for (const mode of GM_WAIT_INTERPRETATION_MODES)
      expect(accepted(initial({ mode })), mode).toBe(true);
    for (const bad of [
      "PLAYER_EXACT",
      "estimate",
      "explicit_duration",
      "EXPLICIT_DURATION ",
      "",
      null,
      0,
      MISSING,
    ]) {
      const v = edit(initial(), ["gm_wait", "interpretation_mode"], bad);
      expect(accepted(v), lbl(bad)).toBe(false);
      expect(refusedByShapeAt(v, "gm_wait.interpretation_mode"), lbl(bad)).toBe(true);
    }
  });

  it("B0 refusal-only: a wrong conversion_rule_version, including CAL_TIME_V1, is refused (R23)", () => {
    expect(accepted(edit(initial(), ["gm_wait", "conversion_rule_version"], SI_SUBDAY_V1))).toBe(
      true,
    );
    for (const bad of [
      "SI_SUBDAY_V2",
      "si_subday_v1",
      "CAL_TIME_V1",
      "SI_SUBDAY_V1 ",
      "",
      null,
      1,
      MISSING,
    ]) {
      const v = edit(initial(), ["gm_wait", "conversion_rule_version"], bad);
      expect(accepted(v), lbl(bad)).toBe(false);
      expect(refusedByShapeAt(v, "gm_wait.conversion_rule_version"), lbl(bad)).toBe(true);
    }
  });

  it("B0 refusal-only: an ill-formed observed_basis is refused (R25)", () => {
    expect(accepted(initial())).toBe(true);
    for (const bad of [
      MISSING,
      null,
      { unit: UNIT, value: -1 },
      { unit: UNIT, value: 1.5 },
      { unit: UNIT, value: Number.MAX_SAFE_INTEGER + 2 },
      { unit: UNIT, value: Number.NaN },
      { unit: UNIT, value: "1000" },
      { unit: "", value: 1000 },
      { unit: " padded", value: 1000 },
      { unit: UNIT },
      { value: 1000 },
      { unit: UNIT, value: 1000, scale: 1 },
      [UNIT, 1000],
    ]) {
      const v = edit(initial(), ["gm_wait", "observed_basis"], bad);
      expect(accepted(v)).toBe(false);
      expect(refusedByShapeAt(v, "gm_wait.observed_basis")).toBe(true);
    }
  });

  it("B0 refusal-only: a missing or ill-formed catalogue_sha256 is refused, and any well-formed digest is accepted as shape only (R26)", () => {
    // shape only: two different well-formed digests are both accepted; neither means anything here
    expect(accepted(edit(initial(), ["gm_wait", "catalogue_sha256"], DIGEST))).toBe(true);
    expect(accepted(edit(initial(), ["gm_wait", "catalogue_sha256"], OTHER_DIGEST))).toBe(true);
    for (const bad of [
      MISSING,
      null,
      DIGEST.toUpperCase(),
      DIGEST.slice(0, 63),
      `${DIGEST}0`,
      `${DIGEST.slice(0, 63)}g`,
      `sha256:${DIGEST}`,
      ` ${DIGEST}`,
      `${DIGEST}\n`,
      "",
      0,
    ]) {
      const v = edit(initial(), ["gm_wait", "catalogue_sha256"], bad);
      expect(accepted(v)).toBe(false);
      expect(refusedByShapeAt(v, "gm_wait.catalogue_sha256")).toBe(true);
    }
  });
});

describe("B0 refusal-only: the CONTINUATION variant is closed", () => {
  it("B0 refusal-only: a CONTINUATION carrying any INITIAL-only member is refused, one member at a time (R42-R44)", () => {
    expect(accepted(continuation())).toBe(true);
    const carried: Value = {
      duration_value: 2,
      duration_unit: "minute",
      interpretation_mode: "EXPLICIT_DURATION",
      conversion_rule_version: SI_SUBDAY_V1,
      observed_basis: { unit: UNIT, value: 1000 },
      catalogue_sha256: DIGEST,
    };
    for (const [member, value] of Object.entries(carried)) {
      const v = edit(continuation(), ["gm_wait", member], value);
      expect(accepted(v), member).toBe(false);
      expect(refusedByShapeAt(v, "gm_wait"), member).toBe(true);
    }
  });

  it("B0 refusal-only: a CONTINUATION with a missing or malformed from_transaction or an extra member is refused", () => {
    expect(accepted(continuation())).toBe(true);
    for (const bad of [MISSING, null, "", " tx-1", "tx-1 ", "tx/1", "tx\n1", 5, ["tx-1"], {}]) {
      const v = edit(continuation(), ["gm_wait", "from_transaction"], bad);
      expect(accepted(v)).toBe(false);
      expect(refusedByShapeAt(v, "gm_wait")).toBe(true);
    }
    const extra = edit(continuation(), ["gm_wait", "note"], "x");
    expect(accepted(extra)).toBe(false);
    expect(refusedByShapeAt(extra, "gm_wait")).toBe(true);
  });
});

describe("B0 refusal-only: the phase and the envelope are closed", () => {
  it("B0 refusal-only: an unknown phase is refused, and PAUSED, INTERRUPTED and RESUME are refused as presently unavailable (R13)", () => {
    expect(accepted(initial())).toBe(true);
    expect(accepted(continuation())).toBe(true);
    for (const phase of [
      "PAUSED",
      "INTERRUPTED",
      "RESUME",
      "RESUMED",
      "initial",
      "Continuation",
      "INITIAL ",
      "",
      null,
      3,
      MISSING,
    ]) {
      for (const base of [initial(), continuation()]) {
        const v = edit(base, ["gm_wait", "phase"], phase);
        expect(accepted(v), lbl(phase)).toBe(false);
        expect(refusedByShapeAt(v, "gm_wait"), lbl(phase)).toBe(true);
      }
    }
    // a not-yet-lowered phase is an unmodelled input, not a third variant
    expect(GmWaitSchema.options).toHaveLength(2);
  });

  it("B0 refusal-only: a GM-origin envelope with gm_wait absent, null or undefined is refused (R11)", () => {
    for (const base of [initial(), continuation()]) {
      expect(accepted(base)).toBe(true);
      for (const bad of [MISSING, null, undefined]) {
        const v = edit(base, ["gm_wait"], bad);
        // a present-but-undefined key is genuinely there, and is still refused
        expect(Object.hasOwn(v, "gm_wait")).toBe(bad !== MISSING);
        expect(accepted(v)).toBe(false);
        expect(refusedByShapeAt(v, "gm_wait")).toBe(true);
      }
    }
  });

  it("B0 refusal-only: an unmodelled envelope member is refused (R10)", () => {
    expect(accepted(initial())).toBe(true);
    for (const member of [
      "turn",
      "requested_horizon",
      "duration",
      "target_override",
      "slices",
      "authored_under",
      "evaluator_policy_version",
    ]) {
      for (const base of [initial(), continuation()]) {
        const v = edit(base, [member], "x");
        expect(accepted(v), member).toBe(false);
        // refused by the shape stage at the envelope itself: an unrecognized key
        expect(refusedByShapeAt(v, ""), member).toBe(true);
      }
    }
    // the nested envelope members are strict too
    for (const path of [
      ["publication", "extra"],
      ["trigger", "extra"],
      ["requested", "extra"],
    ] as const) {
      const v = edit(initial(), path, "x");
      expect(accepted(v), path.join(".")).toBe(false);
    }
  });

  it("B0 refusal-only: a requested with a non-null condition, a null or missing target, or an extra member is refused (R27, R28, R45)", () => {
    const condition = {
      kind: "STOP_AFTER_BOUNDARY",
      object_id: "obj-1",
      boundary_id: "boundary-1",
    };
    for (const base of [initial(), continuation()]) {
      expect(accepted(base)).toBe(true);
      for (const [path, bad] of [
        [["requested", "condition"], condition],
        [["requested", "condition"], "STOP"],
        [["requested", "condition"], MISSING],
        [["requested", "target"], null],
        [["requested", "target"], MISSING],
        [["requested", "target"], { unit: UNIT, value: -1 }],
        [["requested", "extra"], null],
        [["requested"], null],
        [["requested"], MISSING],
      ] as const) {
        const v = edit(base, path, bad);
        expect(accepted(v), path.join(".")).toBe(false);
        expect(refusedByShapeAt(v, "requested"), path.join(".")).toBe(true);
      }
    }
  });
});

describe("B0 refusal-only: the schemas hold the literals the sources fix", () => {
  it("B0 refusal-only: the GM context and trigger literals are exact in the envelope schema, and the player pair is not a GM context", () => {
    expect(GmWaitResolutionRequestShapeSchema.safeParse(initial()).success).toBe(true);
    const player = edit(initial(), ["context"], { ...PLAYER_CHOICE_AUTHORITY });
    expect(GmWaitResolutionRequestShapeSchema.safeParse(player).success).toBe(false);
    const otherTrigger = edit(initial(), ["trigger", "kind"], "direct-observation");
    expect(GmWaitResolutionRequestShapeSchema.safeParse(otherTrigger).success).toBe(false);
    // and the composed parser agrees, by a different stage
    expect(accepted(player)).toBe(false);
    expect(accepted(otherTrigger)).toBe(false);
  });
});
