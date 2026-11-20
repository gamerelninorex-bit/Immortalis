// B0-30..B0-34 — SI_SUBDAY_V1 conversion and safe integer arithmetic for F-014B package B0 (docs/f014b/b0-gm-request-contract.md §2.4, §2.5 step 5, §4 R29-R30, §7).
//
// T1 mechanism component (BLUE v0.3 §4): strict request/refusal contract only; no B1 positive, no T0 PASS, no production capability; F-014B LC closures unchanged.
//
// What it exercises: SI_SUBDAY_V1_SECONDS, siSubdayV1Target and the arithmetic-identity step of parseGmWaitRequest in
// packages/contracts/src/temporal-gm-wait.ts, imported by relative path. They are pure functions of the numbers and the basis they are handed. The
// result is a number in canonical coordinate units with the basis unit carried verbatim: nothing here says that a canonical unit is an SI second, and
// no value reads, infers or maps the spelling of a unit. There is no duration ceiling beyond the representability bound of the existing
// CanonicalTimeSchema.
//
// Non-tautology. The expected values come from an independent BigInt oracle, never from the code under test. Each boundary is tested on both sides:
// the largest accepted value and the next one up are separated by exactly one unit.
import { describe, expect, it } from "vitest";
import {
  GM_INTERPRETED_PC_WAIT,
  GM_WAIT_DURATION_UNITS,
  SI_SUBDAY_V1_SECONDS,
  parseGmWaitRequest,
  siSubdayV1Target,
  type GmWaitDurationUnit,
} from "../../packages/contracts/src/temporal-gm-wait.ts";

const UNIT = "time-unit-fixture";
const MAX = Number.MAX_SAFE_INTEGER;
const FACTOR: Readonly<Record<GmWaitDurationUnit, bigint>> = {
  second: 1n,
  minute: 60n,
  hour: 3600n,
};

/** Exact result of basis + value * factor as a safe number, or null when it is not representable. Independent of the code under test. */
const oracle = (basis: number, value: number, unit: GmWaitDurationUnit): number | null => {
  const t = BigInt(basis) + BigInt(value) * FACTOR[unit];
  return t <= BigInt(MAX) ? Number(t) : null;
};

/** An INITIAL request whose target is whatever the caller says it is. */
const initial = (
  value: number,
  unit: GmWaitDurationUnit,
  basis: { unit: string; value: number },
  target: { unit: string; value: number },
): Record<string, unknown> => ({
  transaction_id: "gm-wait-tx-1",
  cause: "cause-gm-wait-1",
  trigger: { kind: GM_INTERPRETED_PC_WAIT, ref: "ref-gm-wait-1" },
  continues: null,
  requested: { target, condition: null },
  context: { role: "role.gm", permission: "permission.rule.adjudicate" },
  publication: { basis: "basis-label-1", secrecy: "secrecy-label-1" },
  gm_wait: {
    phase: "INITIAL",
    duration_value: value,
    duration_unit: unit,
    observed_basis: basis,
    interpretation_mode: "EXPLICIT_DURATION",
    conversion_rule_version: "SI_SUBDAY_V1",
    catalogue_sha256: "0123456789abcdef".repeat(4),
  },
});

describe("B0 shape control (not admission): the conversion table and the derivation", () => {
  it("B0 shape control (not admission): the SI_SUBDAY_V1 table is exactly second 1, minute 60 and hour 3600, and nothing else", () => {
    expect(SI_SUBDAY_V1_SECONDS).toEqual({ second: 1, minute: 60, hour: 3600 });
    expect(Object.keys(SI_SUBDAY_V1_SECONDS)).toEqual([...GM_WAIT_DURATION_UNITS]);
    for (const absent of ["day", "week", "month", "year", "sunrise", "seconds", "minutes", "hours"])
      expect(Object.hasOwn(SI_SUBDAY_V1_SECONDS, absent), absent).toBe(false);
  });

  it("B0 shape control (not admission): the derivation reproduces the P1a and P1b specimens and the brief specimen, and carries the basis unit verbatim", () => {
    // P1a: basis second:100, 3 second -> 103. P1b: basis second:100, 10 minute -> 700.
    expect(siSubdayV1Target({ unit: "second", value: 100 }, 3, "second")).toEqual({
      ok: true,
      value: { unit: "second", value: 103 },
    });
    expect(siSubdayV1Target({ unit: "second", value: 100 }, 10, "minute")).toEqual({
      ok: true,
      value: { unit: "second", value: 700 },
    });
    // the brief specimen: 2 minute from basis 1000 -> 1120, in the unit the basis states
    expect(siSubdayV1Target({ unit: UNIT, value: 1000 }, 2, "minute")).toEqual({
      ok: true,
      value: { unit: UNIT, value: 1120 },
    });
    expect(siSubdayV1Target({ unit: UNIT, value: 1000 }, 1, "hour")).toEqual({
      ok: true,
      value: { unit: UNIT, value: 4600 },
    });
    // the composed parser accepts exactly these as the derived target
    expect(
      parseGmWaitRequest(
        initial(2, "minute", { unit: UNIT, value: 1000 }, { unit: UNIT, value: 1120 }),
      ).ok,
    ).toBe(true);
  });

  it("B0 shape control (not admission): the derivation agrees with an independent BigInt oracle over a grid that straddles the safe-integer bound", () => {
    const bases = [0, 1, 100, 1000, MAX - 3601, MAX - 3600, MAX - 3599, MAX - 1, MAX];
    const values = [
      1,
      2,
      59,
      60,
      61,
      3599,
      3600,
      3601,
      150119987579015,
      150119987579016,
      150119987579017,
      2501999792982,
      2501999792983,
      2501999792984,
      MAX - 1,
      MAX,
    ];
    let accepted = 0;
    let refused = 0;
    for (const basis of bases)
      for (const value of values)
        for (const unit of GM_WAIT_DURATION_UNITS) {
          const want = oracle(basis, value, unit);
          const got = siSubdayV1Target({ unit: UNIT, value: basis }, value, unit);
          const label = `${basis} + ${value} ${unit}`;
          if (want === null) {
            refused++;
            expect(got.ok, label).toBe(false);
          } else {
            accepted++;
            expect(got, label).toEqual({ ok: true, value: { unit: UNIT, value: want } });
          }
        }
    // the grid really exercises both outcomes
    expect(accepted).toBeGreaterThan(50);
    expect(refused).toBeGreaterThan(50);
  });
});

describe("B0 refusal-only: the arithmetic identity and its bounds", () => {
  it("B0 refusal-only: a target that is not observed_basis plus the converted duration is refused (R29)", () => {
    const basis = { unit: UNIT, value: 1000 };
    // control: the exact derivation is accepted, for each unit
    expect(parseGmWaitRequest(initial(2, "minute", basis, { unit: UNIT, value: 1120 })).ok).toBe(
      true,
    );
    expect(parseGmWaitRequest(initial(2, "hour", basis, { unit: UNIT, value: 8200 })).ok).toBe(
      true,
    );
    expect(parseGmWaitRequest(initial(2, "second", basis, { unit: UNIT, value: 1002 })).ok).toBe(
      true,
    );
    const wrong: ReadonlyArray<readonly [string, { unit: string; value: number }]> = [
      ["off by one below", { unit: UNIT, value: 1119 }],
      ["off by one above", { unit: UNIT, value: 1121 }],
      ["equal to the basis", { unit: UNIT, value: 1000 }],
      ["before the basis", { unit: UNIT, value: 999 }],
      ["zero", { unit: UNIT, value: 0 }],
      ["a model-authored absolute value", { unit: UNIT, value: 5000 }],
      ["the duration read as seconds in the wrong unit's factor", { unit: UNIT, value: 1002 }],
      ["a different unit with the right value", { unit: "other-unit", value: 1120 }],
      ["a unit differing only by case", { unit: "Time-Unit-Fixture", value: 1120 }],
    ];
    for (const [name, target] of wrong) {
      const r = parseGmWaitRequest(initial(2, "minute", basis, target));
      expect(r.ok, name).toBe(false);
      // refused by the cross-field arithmetic rule, not by the shape: the target is a perfectly formed time
      expect(!r.ok && r.error.details?.["issues"], name).toBeUndefined();
      expect(!r.ok && r.error.message, name).toMatch(/SI_SUBDAY_V1 derivation/);
    }
    // the derivation function itself refuses unusable inputs, each one change from the accepted specimen
    expect(siSubdayV1Target(basis, 2, "minute").ok).toBe(true);
    for (const [value, unit] of [
      [0, "minute"],
      [-1, "minute"],
      [-0, "minute"],
      [1.5, "minute"],
      [0.5, "minute"],
      [Number.NaN, "minute"],
      [Number.POSITIVE_INFINITY, "minute"],
      [2, "minutes"],
      [2, "Minute"],
      [2, "day"],
      [2, "toString"],
      [2, "constructor"],
      [2, "__proto__"],
    ] as const)
      expect(
        siSubdayV1Target(basis, value, unit as GmWaitDurationUnit).ok,
        `${value} ${unit}`,
      ).toBe(false);
    expect(siSubdayV1Target({ unit: UNIT, value: -1 }, 2, "minute").ok).toBe(false);
    expect(siSubdayV1Target({ unit: "", value: 1000 }, 2, "minute").ok).toBe(false);
  });

  it("B0 refusal-only: overflow at the exact safe-integer boundaries is refused (R30)", () => {
    const zero = { unit: UNIT, value: 0 };
    // largest accepted, then the next one up, for each unit, at basis 0
    expect(siSubdayV1Target(zero, 150119987579016, "minute")).toEqual({
      ok: true,
      value: { unit: UNIT, value: 9007199254740960 },
    });
    expect(siSubdayV1Target(zero, 150119987579017, "minute").ok).toBe(false);
    expect(siSubdayV1Target(zero, 2501999792983, "hour")).toEqual({
      ok: true,
      value: { unit: UNIT, value: 9007199254738800 },
    });
    expect(siSubdayV1Target(zero, 2501999792984, "hour").ok).toBe(false);
    expect(siSubdayV1Target(zero, MAX, "second")).toEqual({
      ok: true,
      value: { unit: UNIT, value: MAX },
    });
    expect(siSubdayV1Target(zero, MAX + 1, "second").ok).toBe(false);
    // the basis at its own bound: one second more than the bound is refused, one second fewer is exact
    expect(siSubdayV1Target({ unit: UNIT, value: MAX }, 1, "second").ok).toBe(false);
    expect(siSubdayV1Target({ unit: UNIT, value: MAX - 1 }, 1, "second")).toEqual({
      ok: true,
      value: { unit: UNIT, value: MAX },
    });
    // and in general: the largest accepted duration is floor((2^53 - 1 - basis) / factor), and one more is refused
    for (const basis of [1, 1000, 123456789, MAX - 7200])
      for (const unit of GM_WAIT_DURATION_UNITS) {
        const top = Number((BigInt(MAX) - BigInt(basis)) / FACTOR[unit]);
        const label = `${basis} ${unit}`;
        expect(siSubdayV1Target({ unit: UNIT, value: basis }, top, unit).ok, label).toBe(top >= 1);
        expect(siSubdayV1Target({ unit: UNIT, value: basis }, top + 1, unit).ok, label).toBe(false);
      }
    // through the composed parser: the same pair of neighbours, with the target stated for the accepted one
    const exact = initial(150119987579016, "minute", zero, { unit: UNIT, value: 9007199254740960 });
    expect(parseGmWaitRequest(exact).ok).toBe(true);
    const over = parseGmWaitRequest(
      initial(150119987579017, "minute", zero, { unit: UNIT, value: MAX }),
    );
    expect(over.ok).toBe(false);
    expect(!over.ok && over.error.message).toMatch(/not representable/);
    // the duration member alone is bounded by the schema at the same bound
    expect(
      parseGmWaitRequest(initial(MAX + 1, "second", zero, { unit: UNIT, value: MAX })).ok,
    ).toBe(false);
  });

  it("B0 refusal-only: the same specimen yields the same result whatever the basis unit spelling, so no SI meaning is inferred from it (R30)", () => {
    const spellings = [
      "second",
      "SECOND",
      "s",
      "tick",
      "turn",
      "calendar-day",
      "unit:1 second",
      UNIT,
      "π",
    ];
    for (const unit of spellings) {
      // the accepted specimen: the value is the same, and the unit is carried through untouched
      expect(siSubdayV1Target({ unit, value: 1000 }, 2, "minute"), unit).toEqual({
        ok: true,
        value: { unit, value: 1120 },
      });
      // the refused specimen: the same overflow is refused, whichever way the unit is spelled
      expect(siSubdayV1Target({ unit, value: MAX }, 1, "second").ok, unit).toBe(false);
      // and the composed parser agrees on both
      expect(
        parseGmWaitRequest(initial(2, "minute", { unit, value: 1000 }, { unit, value: 1120 })).ok,
        unit,
      ).toBe(true);
      expect(
        parseGmWaitRequest(initial(2, "minute", { unit, value: 1000 }, { unit, value: 1121 })).ok,
        unit,
      ).toBe(false);
    }
  });
});
