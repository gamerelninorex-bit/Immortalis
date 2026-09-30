import { z } from "zod";

/**
 * Opaque identifier: non-empty, no control characters, no leading/trailing whitespace.
 * F-027 fixes no identifier grammar; this is deliberately the weakest rule that keeps identifiers
 * unambiguous in canonical serialization, and it invents no vocabulary.
 */
const hasControlChar = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
};

export const Id = z
  .string()
  .min(1)
  .refine((s) => s === s.trim() && !hasControlChar(s), "invalid identifier");

export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
export const Revision = z.number().int().nonnegative();
export const Version = z.number().int().nonnegative();
