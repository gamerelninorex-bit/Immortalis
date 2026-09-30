import { z } from "zod";
import { Id, Version } from "./ids.ts";
import { JsonValueSchema } from "./json.ts";
import { SourceRefSchema } from "./source-ref.ts";

/**
 * RC-02 — OwnerFact.
 *
 * Every material field is mandatory and preserved verbatim by persistence. F-027 does not define
 * vocabularies for `unit`, `basis` or `secrecy`, so they are opaque identifiers here: serialization
 * may not erase or normalize them, and no default is ever substituted (IA-02). `unit` is `null` only
 * as an explicit "no unit" statement, never as an omission.
 *
 * Guard: only the substantive owner writes. Foreign facts are referenced, never copied into a second
 * writable truth.
 */
const OwnerFactCore = {
  /** stable fact/entity key */
  key: Id,
  /** authoritative owner / facet */
  owner: Id,
  facet: Id,
  /** typed value or range */
  value: JsonValueSchema,
  unit: Id.nullable(),
  /** effective/close basis */
  basis: Id,
  /** secrecy/access class */
  secrecy: Id,
};

/** A proposed write, as carried inside a CommitGroup (RC-07). */
export const OwnerFactWriteSchema = z.strictObject({
  ...OwnerFactCore,
  /** 0 = the fact must not exist yet; otherwise the exact current version. */
  expected_version: Version,
});
export type OwnerFactWrite = z.infer<typeof OwnerFactWriteSchema>;

/** A committed fact. `version` starts at 1 and increases by 1 with each committed write. */
export const OwnerFactSchema = z.strictObject({
  ...OwnerFactCore,
  version: z.number().int().positive(),
  /** source/provenance: the committing group and its governing rule */
  provenance: z.strictObject({
    group_id: Id,
    intent_id: Id,
    cause: Id,
    rule: SourceRefSchema,
  }),
});
export type OwnerFact = z.infer<typeof OwnerFactSchema>;
