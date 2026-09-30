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
