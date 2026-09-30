import { createHash } from "node:crypto";
import { canonicalJson } from "@immortalis/contracts";

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** sha256 over the canonical JSON serialization of `value`. */
export function sha256Canonical(value: unknown): string {
  return sha256Text(canonicalJson(value));
}

/** Structural equality by canonical JSON serialization. */
export const canonicalEqual = (a: unknown, b: unknown): boolean =>
  canonicalJson(a) === canonicalJson(b);
