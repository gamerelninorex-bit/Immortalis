import { isWellFormedString } from "@immortalis/contracts";
import { sha256Text } from "../hash.ts";

/**
 * CD-CANON-1 (F-027-CD1 CDK-02): UTF-8 JSON over plain JSON values using the RFC 8785 (JCS) serialization rules for
 * strings and numbers, with the Causal-Draw-specific constraints:
 *
 *  - object keys sorted ascending by UTF-16 code-unit order, recursively; no insignificant whitespace;
 *  - strings serialized exactly as RFC 8785 / ECMAScript JSON strings; a LONE SURROGATE is invalid (it is refused here;
 *    it is never escaped, replaced or normalized), and so is a lone surrogate in an object key;
 *  - arrays keep their contract-defined order; no Unicode normalization;
 *  - exact candidate weights are decimal STRINGS, so no weight ever reaches the number rule.
 *
 * This is deliberately a separate encoder rather than a call into the repository's generic `canonicalJson`: that helper
 * serializes a lone surrogate as an escape sequence (it never refuses one), so it is not CD-CANON-1. For every VALID
 * Causal Draw value the two emit identical bytes; tests/unit/causal-draw-canon.test.ts demonstrates exactly that
 * equivalence (and the one divergence), so the helper's behavior can never silently become the authority.
 */
export class CdCanonError extends Error {
  readonly reason: "LONE_SURROGATE" | "NOT_PLAIN_JSON";
  constructor(reason: CdCanonError["reason"], message: string) {
    super(message);
    this.name = "CdCanonError";
    this.reason = reason;
  }
}

const notJson = (what: string): never => {
  throw new CdCanonError("NOT_PLAIN_JSON", `CD-CANON-1: ${what}`);
};

function encodeString(s: string): string {
  if (!isWellFormedString(s)) {
    throw new CdCanonError("LONE_SURROGATE", "CD-CANON-1: lone surrogate code unit in a string");
  }
  // RFC 8785 §3.2.2.2 string serialization is ECMAScript JSON.stringify for well-formed strings.
  return JSON.stringify(s);
}

export function cdCanon(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return encodeString(value);
    case "number":
      if (!Number.isFinite(value)) return notJson("non-finite number");
      // RFC 8785 §3.2.2.3: ECMAScript Number-to-string (-0 serializes as 0).
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(cdCanon).join(",")}]`;
      const proto: unknown = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return notJson("only plain objects");
      const record = value as Record<string, unknown>;
      // default Array.prototype.sort compares UTF-16 code units, which is the required key order
      const parts = Object.keys(record)
        .sort()
        .map((k) => {
          if (record[k] === undefined) return notJson(`undefined at ${JSON.stringify(k)}`);
          return `${encodeString(k)}:${cdCanon(record[k])}`;
        });
      return `{${parts.join(",")}}`;
    }
    default:
      return notJson(`unsupported type ${typeof value}`);
  }
}

/** SHA-256 over the UTF-8 bytes of the CD-CANON-1 encoding, lowercase hexadecimal. */
export const cdDigest = (value: unknown): string => sha256Text(cdCanon(value));

/**
 * True when any string or object key anywhere in `value` carries a lone surrogate. Total over arbitrary input (no
 * throw, no recursion into non-plain values it cannot judge), so structural validation can run it first.
 */
export function containsLoneSurrogate(value: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (typeof value === "string") return !isWellFormedString(value);
  if (Array.isArray(value)) return value.some((v) => containsLoneSurrogate(v, depth + 1));
  if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      if (!isWellFormedString(k) || containsLoneSurrogate(v, depth + 1)) return true;
    }
  }
  return false;
}
