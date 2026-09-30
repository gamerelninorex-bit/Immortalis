import { z } from "zod";
import { CommitGroupSchema, CommitReceiptSchema } from "./commit.ts";
import { Id, Revision, Sha256 } from "./ids.ts";
import { OwnerFactSchema } from "./owner-fact.ts";
import { SpecIdentitySchema } from "./spec-identity-schema.ts";

/** Structured campaign package: portable, independent of any LLM conversation (Roadmap "Save / Load Model"). */
export const PACKAGE_FORMAT = "immortalis.campaign-package";
export const PACKAGE_FORMAT_VERSION = 1;

export const BuildInfoSchema = z.strictObject({
  package: Id,
  version: Id,
  /** informational only (e.g. a git commit SHA); never used to gate loading */
  build_id: Id.nullable(),
});
export type BuildInfo = z.infer<typeof BuildInfoSchema>;

export const CompatibilitySchema = z.strictObject({
  /** hash of the Runtime Contract snapshot the canon was written under */
  runtime_contract_sha256: Sha256,
});
export type Compatibility = z.infer<typeof CompatibilitySchema>;

/** The immutable identity block. Its hash seeds the journal chain and is recorded in the manifest. */
export const GenesisSchema = z.strictObject({
  format: z.literal(PACKAGE_FORMAT),
  format_version: z.literal(PACKAGE_FORMAT_VERSION),
  campaign_id: Id,
  /** provenance: the spec line the campaign was created under (immutable) */
  spec_identity: SpecIdentitySchema,
  /** compatibility: what the campaign's canon requires of a loading build (immutable) */
  compatibility: CompatibilitySchema,
  created_with: BuildInfoSchema,
});
export type Genesis = z.infer<typeof GenesisSchema>;

export const STATE_FILE_PATTERN = /^state\.[0-9]{10}\.json$/;

export const ManifestSchema = z.strictObject({
  format: z.literal(PACKAGE_FORMAT),
  format_version: z.literal(PACKAGE_FORMAT_VERSION),
  campaign_id: Id,
  spec_identity: SpecIdentitySchema,
  compatibility: CompatibilitySchema,
  created_with: BuildInfoSchema,
  last_saved_with: BuildInfoSchema,
  /** provenance of the most recent save; informational, never gates loading */
  last_saved_spec_identity: SpecIdentitySchema,
  genesis_sha256: Sha256,
  /** the commit point: everything not referenced here is uncommitted residue */
  head: z.strictObject({
    revision: Revision,
    state_file: z.string().regex(STATE_FILE_PATTERN),
    state_sha256: Sha256,
    journal_entries: z.number().int().nonnegative(),
    journal_bytes: z.number().int().nonnegative(),
    /** chain hash of the last committed journal entry (genesis hash when there are none) */
    journal_head_sha256: Sha256,
  }),
  /** sha256 of the canonical manifest without this field: corruption detection, not authentication */
  self_sha256: Sha256,
});
export type Manifest = z.infer<typeof ManifestSchema>;

/** Materialized state at one revision. Facts are stored sorted by key. */
export const StateFileSchema = z.strictObject({
  campaign_id: Id,
  revision: Revision,
  facts: z.array(OwnerFactSchema),
});
export type StateFile = z.infer<typeof StateFileSchema>;

/** One committed group: append-only, hash-chained history (RC-16 recovery identity, RC-09-adjacent replay evidence). */
export const JournalEntrySchema = z.strictObject({
  revision: Revision.min(1),
  prev_sha256: Sha256,
  group: CommitGroupSchema,
  receipt: CommitReceiptSchema,
  entry_sha256: Sha256,
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;
