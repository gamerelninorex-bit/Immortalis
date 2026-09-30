import { z } from "zod";
import { Id, Sha256 } from "./ids.ts";

/**
 * Identity of the governing implementation/spec line (IA-01). Derived mechanically from
 * spec/f027/spec-lock.json by tools/gen-spec-identity.ts; never hand-edited.
 */
export const SpecIdentitySchema = z.strictObject({
  line: Id,
  package_version: Id,
  package_native_pin: Id,
  /** sha256 of spec-lock.json itself (LF-normalized) */
  spec_lock_sha256: Sha256,
  /** sha256 of each snapshot file as recorded in the lock */
  snapshot_files: z.record(Id, Sha256),
});
export type SpecIdentity = z.infer<typeof SpecIdentitySchema>;

export const RUNTIME_CONTRACT_SNAPSHOT = "spec/f027/runtime-contract.md";

/**
 * Compatibility key of a spec line: the hash of the Runtime Contract snapshot (RC-01–RC-16, IM map)
 * only. Register status, open-gate wording, pins and the lock file itself are provenance, not
 * compatibility: evidence-only changes must never make a compatible save unloadable.
 */
export const runtimeContractSha256 = (spec: SpecIdentity): string | undefined =>
  spec.snapshot_files[RUNTIME_CONTRACT_SNAPSHOT];
