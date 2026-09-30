import { z } from "zod";
import { Id } from "./ids.ts";

/**
 * RC-01 — SourceRef / RuleRef (spec/f027/runtime-contract.md).
 * Guard: edit recency alone never establishes authority. A pin locks identity, not permission.
 */
export const SourceRefSchema = z.strictObject({
  /** immutable page/artifact identity */
  artifact: Id,
  /** exact native pin or immutable version */
  native_pin: Id,
  /** clause/rule reference */
  clause: Id,
  /** authority lineage */
  authority_lineage: z.array(Id).min(1),
  /** effective basis */
  effective_basis: Id,
  /** supersession relation where applicable; null when none */
  supersedes: Id.nullable(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;
