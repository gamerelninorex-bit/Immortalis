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

describe("A28 canonical JSON dense arrays", () => {
  const deleted = [1, 2, 3];
  Reflect.deleteProperty(deleted, "1");
  const inherited = Object.setPrototypeOf(
    Array(1),
    Object.assign(Object.create(Array.prototype), {
      0: "inherited",
    }),
  );

  it.each([
    { name: "one hole", value: Array(1) },
    { name: "two holes", value: Array(2) },
    { name: "first hole", value: Object.assign(Array(2), { 1: 1 }) },
    { name: "middle hole", value: Object.assign(Array(3), { 0: 1, 2: 2 }) },
    { name: "last hole", value: Object.assign(Array(2), { 0: 1 }) },
    { name: "deleted own slot", value: deleted },
    { name: "inherited slot", value: inherited },
    { name: "nested array", value: { nested: [[1, Array(1)]] } },
  ])("refuses $name before serialization or hashing", ({ value }) => {
    expect(() => canonicalJson(value)).toThrow(TypeError);
    expect(() => sha256Canonical(value)).toThrow(TypeError);
  });

  it("preserves dense array bytes and refuses unsupported dense values", () => {
    expect(canonicalJson([])).toBe("[]");
    expect(canonicalJson([null])).toBe("[null]");
    expect(canonicalJson([1, false, "ár", [true, -0, null, { z: 1, a: 2 }]])).toBe(
      '[1,false,"ár",[true,0,null,{"a":2,"z":1}]]',
    );
    for (const bad of [[undefined], { nested: [[undefined]] }, [() => 1], [1n], [-Infinity]])
      expect(() => canonicalJson(bad)).toThrow(TypeError);
  });
});
