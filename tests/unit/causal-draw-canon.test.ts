// CD-CANON-1 (F-027-CD1 CDK-02): the canonical encoding that draw identity and every digest depend on. Known-answer
// vectors below were produced by an INDEPENDENT reference implementation written from the addendum text (not from this
// codebase), so they pin the bytes themselves rather than mirror the encoder.
// Register lineage: IA-02, IA-30 (partial); F-027-CD1 CDK-02. Spec lock f027 + implementation_authority_addenda F-027-CD1.
import { describe, expect, it } from "vitest";
import { canonicalJson } from "@immortalis/contracts";
import { CdCanonError, cdCanon, cdDigest, containsLoneSurrogate } from "@immortalis/engine";

const LONE_HIGH = "\ud800";
const LONE_LOW = "\udc00";

describe("CD-CANON-1 known-answer vectors (independent reference)", () => {
  it("serializes the spec'd example byte for byte: keys in UTF-16 code-unit order, no whitespace, JCS strings", () => {
    const value = {
      b: 1,
      a: [true, null, 'é😀 \u001f"\\'],
      "퟿": 0,
      "": 1,
      "\u{10000}": 2,
    };
    expect(cdCanon(value)).toBe(
      '{"a":[true,null,"é😀 \\u001f\\"\\\\"],"b":1,"퟿":0,"\u{10000}":2,"":1}',
    );
    expect(cdDigest(value)).toBe(
      "b273b289ca8cd4fc3cf6dc22277fd5b5e58c746eccfd11db3c22babb448e45b0",
    );
  });

  it("orders object keys by UTF-16 code units, which is NOT code-point order (a supplementary key sorts before U+E000)", () => {
    const keys = Object.keys(JSON.parse(cdCanon({ "": 1, "\u{10000}": 2, "퟿": 3 })));
    expect(keys).toEqual(["퟿", "\u{10000}", ""]);
  });

  it("emits JCS string escapes only for the C0 controls, the quote and the backslash", () => {
    expect(cdCanon('\b\t\n\f\r\u0000\u001f\u007f"\\/')).toBe(
      '"\\b\\t\\n\\f\\r\\u0000\\u001f\u007f\\"\\\\/"',
    );
  });

  it("performs no Unicode normalization: NFC and NFD forms are different identities", () => {
    const nfc = "é";
    const nfd = "é";
    expect(cdCanon(nfc)).not.toBe(cdCanon(nfd));
    expect(cdDigest({ k: nfc })).not.toBe(cdDigest({ k: nfd }));
  });

  it("serializes numbers by the RFC 8785 / ECMAScript rule and keeps weights, being strings, out of the number rule", () => {
    expect(cdCanon(9007199254740991)).toBe("9007199254740991");
    expect(cdCanon(1)).toBe("1");
    expect(cdCanon(-0)).toBe("0");
    expect(cdCanon(1e21)).toBe("1e+21");
    expect(cdCanon({ weight: "100000000000000000000000000001" })).toBe(
      '{"weight":"100000000000000000000000000001"}',
    );
  });

  it("preserves array order and distinguishes null, false and absent members", () => {
    expect(cdCanon([3, 1, 2, null, false])).toBe("[3,1,2,null,false]");
    expect(cdCanon({})).toBe("{}");
    expect(cdCanon([])).toBe("[]");
  });
});

describe("lone surrogates are INVALID, never escaped, replaced or normalized", () => {
  it("refuses a lone high or low surrogate in a string value, at any depth", () => {
    for (const bad of [LONE_HIGH, LONE_LOW, `a${LONE_HIGH}b`, `${LONE_HIGH}${LONE_HIGH}`]) {
      expect(() => cdCanon(bad), JSON.stringify(bad)).toThrow(CdCanonError);
      expect(() => cdCanon({ nested: [{ deep: bad }] })).toThrow(CdCanonError);
    }
    // a reversed pair is two lone surrogates, not a pair
    expect(() => cdCanon(`${LONE_LOW}${LONE_HIGH}`)).toThrow(CdCanonError);
  });

  it("refuses a lone surrogate in an object KEY", () => {
    expect(() => cdCanon({ [LONE_HIGH]: 1 })).toThrow(CdCanonError);
    try {
      cdCanon({ [LONE_LOW]: 1 });
    } catch (e) {
      expect((e as CdCanonError).reason).toBe("LONE_SURROGATE");
    }
  });

  it("accepts a well-formed surrogate PAIR (a supplementary-plane character)", () => {
    expect(cdCanon("😀")).toBe('"😀"');
    expect(containsLoneSurrogate("😀")).toBe(false);
  });

  it("containsLoneSurrogate is total over arbitrary input and finds one anywhere", () => {
    expect(containsLoneSurrogate({ a: [{ b: LONE_HIGH }] })).toBe(true);
    expect(containsLoneSurrogate({ [LONE_LOW]: 1 })).toBe(true);
    expect(containsLoneSurrogate({ a: ["fine", 1, null, true] })).toBe(false);
    expect(containsLoneSurrogate(undefined)).toBe(false);
    expect(containsLoneSurrogate(Symbol("x"))).toBe(false);
  });
});

describe("CD-CANON-1 refuses anything that is not plain JSON", () => {
  it("refuses non-finite numbers, undefined members, bigint, symbols, functions, Dates and class instances", () => {
    class Boxed {
      readonly v = 1;
    }
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      { a: undefined },
      10n,
      Symbol("s"),
      () => 1,
      new Date(0),
      new Boxed(),
      new Map(),
    ]) {
      expect(() => cdCanon(bad)).toThrow(CdCanonError);
    }
  });
});

describe("the repository's generic canonicalJson is NOT CD-CANON-1, and is reused nowhere in it", () => {
  const valid: unknown[] = [
    null,
    true,
    0,
    1,
    9007199254740991,
    "plain",
    "é😀",
    "  ",
    '\u0000\u001f\u007f"\\/',
    [],
    {},
    { b: 1, a: 2, é: 3, "\u{10000}": 4, "": 5, "퟿": 6 },
    [{ z: [1, 2, { y: "x" }], a: null }, "tail"],
    { weight: "12345678901234567890123456789", version: 7 },
    { "": 1, " ": 2, "a b": 3 },
  ];

  it("emits IDENTICAL bytes for every valid value, so the two cannot diverge on a lawful draw", () => {
    for (const v of valid) expect(cdCanon(v), JSON.stringify(v)).toBe(canonicalJson(v));
  });

  it("DIVERGES on the one value that matters: the generic helper escapes a lone surrogate instead of refusing it", () => {
    expect(canonicalJson(LONE_HIGH)).toBe('"\\ud800"');
    expect(() => cdCanon(LONE_HIGH)).toThrow(CdCanonError);
    expect(canonicalJson({ [LONE_LOW]: 1 })).toBe('{"\\udc00":1}');
    expect(() => cdCanon({ [LONE_LOW]: 1 })).toThrow(CdCanonError);
  });
});
