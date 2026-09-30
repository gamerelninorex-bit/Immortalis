import { z } from "zod";
import { Id, Revision, Sha256, Version } from "./ids.ts";
import { OwnerFactWriteSchema } from "./owner-fact.ts";
import { SourceRefSchema } from "./source-ref.ts";

/**
 * Authority context for canonical publication. Per Runtime/Translation v0.2 §5.2 rule 6, canonical
 * publication uses role.archivist + permission.canon.write. Host assertions carry no authority
 * (§5.2 rule 9); the caller is trusted engine code, and OB-016 code-era conformance remains open.
 */
export const AuthoritySchema = z.strictObject({ role: Id, permission: Id });
export type Authority = z.infer<typeof AuthoritySchema>;

export const CANON_WRITE_AUTHORITY = {
  role: "role.archivist",
  permission: "permission.canon.write",
} as const satisfies Authority;

/**
 * RC-07 — StagedDelta / CommitGroup (input side). One group per owner/facet.
 * Guard: uncommitted staging is never current truth; a valid group publishes atomically; independent
 * groups remain independent (so there is deliberately no campaign-wide "expected revision").
 */
export const CommitGroupSchema = z.strictObject({
  campaign_id: Id,
  /** canonical group identity (RC-16) */
  group_id: Id,
  /** immutable intent identity (RC-16); replay of the same intent returns the original receipt */
  intent_id: Id,
  owner: Id,
  facet: Id,
  /** cause */
  cause: Id,
  /** governing rule/method */
  rule: SourceRefSchema,
  authority: AuthoritySchema,
  /** expected source/input versions: facts read whose versions must still be current at publication */
  reads: z.array(z.strictObject({ key: Id, version: Version })),
  /** group dependencies: groups that must already be committed */
  depends_on: z.array(Id),
  /** proposed delta */
  writes: z.array(OwnerFactWriteSchema).min(1),
});
export type CommitGroup = z.infer<typeof CommitGroupSchema>;

/** RC-16 — Commit Receipt / Recovery Identity. */
export const CommitReceiptSchema = z.strictObject({
  outcome: z.literal("COMMITTED"),
  campaign_id: Id,
  group_id: Id,
  intent_id: Id,
  /** campaign revision produced by this commit */
  revision: Revision.min(1),
  /** hash of the canonical group; equal identity + equal hash means replay */
  group_sha256: Sha256,
  /** hash of the full canonical state after this commit */
  state_sha256: Sha256,
  /** effective source/rule/authority basis */
  basis: z.strictObject({
    spec_lock_sha256: Sha256,
    rule: SourceRefSchema,
    authority: AuthoritySchema,
  }),
  /** invariant results (RC-07) */
  invariants: z.array(z.strictObject({ name: Id, passed: z.literal(true) })),
});
export type CommitReceipt = z.infer<typeof CommitReceiptSchema>;
