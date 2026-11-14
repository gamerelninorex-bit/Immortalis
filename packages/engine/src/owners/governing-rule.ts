import type { SourceRef } from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import type { FactKind } from "./registry.ts";

/**
 * Exact registered citation and value-class compatibility (RC-01/07). Classification grants no
 * owner authority: callers still enforce the kind's schema, lifecycle and substantive admission.
 * Historical citations remain load-only; an alternate is current only for its registered class.
 */
export function classifyGoverningRule(
  kind: FactKind,
  citation: SourceRef,
  value: unknown,
): "CURRENT" | "ALTERNATE" | "HISTORICAL" | "INVALID" {
  if (canonicalEqual(citation, kind.rule)) return "CURRENT";
  if (kind.alternateRules?.some((r) => canonicalEqual(citation, r.rule) && r.admits(value))) {
    return "ALTERNATE";
  }
  const legacy = kind.legacyRule;
  if (
    (legacy !== undefined && canonicalEqual(citation, legacy.rule) && legacy.admits(value)) ||
    kind.laterLegacyRules?.some((r) => canonicalEqual(citation, r.rule) && r.admits(value))
  ) {
    return "HISTORICAL";
  }
  return "INVALID";
}
