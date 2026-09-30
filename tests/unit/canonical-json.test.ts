import { describe, expect, it } from "vitest";
import { canonicalJson } from "@immortalis/contracts";
import { sha256Canonical } from "@immortalis/engine";

describe("canonicalJson", () => {
  it("is independent of key insertion order and nested", () => {
    const a = { b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } };
    const b = { a: { c: null, d: [3, { x: 2, y: 1 }] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}');
    expect(sha256Canonical(a)).toBe(sha256Canonical(b));
  });

  it("preserves array order", () => {
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it("refuses non-JSON so it can never be hashed as canon", () => {
    expect(() => canonicalJson({ a: undefined })).toThrow();
    expect(() => canonicalJson(Number.NaN)).toThrow();
    expect(() => canonicalJson(Infinity)).toThrow();
    expect(() => canonicalJson(new Date())).toThrow();
    expect(() => canonicalJson(() => 1)).toThrow();
    expect(() => canonicalJson(10n)).toThrow();
  });

  it("produces a stable digest (golden)", () => {
    expect(sha256Canonical({ a: 1 })).toBe(
      "015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862",
    );
  });
});
