import { isWellFormedCjaString } from "@immortalis/contracts";
import { sha256Canonical } from "../hash.ts";

/**
 * CJA1 §3.4 — `sha256Canonical` is the repository's canonical plain-JSON byte process (`../hash.ts` over the contracts
 * `canonicalJson`: object keys sorted by UTF-16 code unit, no insignificant whitespace, ECMAScript JSON strings, UTF-8,
 * SHA-256), NOT F-027-CD1's private CD-CANON-1 protocol. That generic helper serializes a lone surrogate as an escape
 * sequence instead of refusing it, so CJA1 refuses ill-formed input BEFORE serialization with this guard. Nothing is
 * normalized: no Unicode normalization, no escaping, no replacement.
 *
 * "Ambiguous Unicode" has no further definition in the specification; the only ambiguity refused here is ill-formed UTF-16
 * (a lone surrogate code unit, in a string or in an object key). Non-plain objects (class instances, Map, Set, Date, ...),
 * `undefined`, non-finite numbers, bigint, functions and symbols are refused as non-plain / non-finite JSON.
 */
export class CjaCanonError extends Error {
  readonly reason: "LONE_SURROGATE" | "NOT_PLAIN_JSON";
  constructor(reason: CjaCanonError["reason"], message: string) {
    super(message);
    this.name = "CjaCanonError";
    this.reason = reason;
  }
}

const MAX_DEPTH = 64;

/** Throws `CjaCanonError` unless `value` is well-formed plain JSON throughout (strings and keys included). */
export function assertCjaCanonical(value: unknown, depth = 0): void {
  if (depth > MAX_DEPTH)
    throw new CjaCanonError("NOT_PLAIN_JSON", "CJA canonical: too deeply nested");
  if (value === null) return;
  switch (typeof value) {
    case "boolean":
      return;
    case "string":
      if (!isWellFormedCjaString(value)) {
        throw new CjaCanonError(
          "LONE_SURROGATE",
          "CJA canonical: lone surrogate code unit in a string",
        );
      }
      return;
    case "number":
      if (!Number.isFinite(value))
        throw new CjaCanonError("NOT_PLAIN_JSON", "CJA canonical: non-finite number");
      return;
    case "object": {
      if (Array.isArray(value)) {
        for (const v of value) assertCjaCanonical(v, depth + 1);
        return;
      }
      const proto: unknown = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new CjaCanonError("NOT_PLAIN_JSON", "CJA canonical: only plain objects");
      }
      for (const [k, v] of Object.entries(value)) {
        if (!isWellFormedCjaString(k)) {
          throw new CjaCanonError(
            "LONE_SURROGATE",
            "CJA canonical: lone surrogate code unit in a key",
          );
        }
        if (v === undefined)
          throw new CjaCanonError("NOT_PLAIN_JSON", "CJA canonical: undefined member");
        assertCjaCanonical(v, depth + 1);
      }
      return;
    }
    default:
      throw new CjaCanonError("NOT_PLAIN_JSON", `CJA canonical: unsupported type ${typeof value}`);
  }
}

/** True when `value` is well-formed plain JSON throughout (total: never throws). */
export function isCjaCanonical(value: unknown): boolean {
  try {
    assertCjaCanonical(value);
    return true;
  } catch {
    return false;
  }
}

/** `sha256Canonical` over a value refused BEFORE serialization when it is ill-formed. Lowercase hexadecimal. */
export function cjaDigest(value: unknown): string {
  assertCjaCanonical(value);
  return sha256Canonical(value);
}
