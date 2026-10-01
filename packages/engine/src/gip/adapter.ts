import {
  CANON_WRITE_AUTHORITY,
  InstitutionIdentitySchema,
  PublicationSchema,
  fail,
  gipInstitutionIdentityKey,
  type CommitGroup,
  type InstitutionIdentity,
  type OwnerFact,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";

export type GipErrorCode = StoreCommitErrorCode | "INPUT_INVALID";

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);

/** A committed Institution Identity read by identity: the fact (with its provenance) and its typed value. */
export interface TypedInstitutionIdentity {
  readonly fact: OwnerFact;
  readonly value: InstitutionIdentity;
}

/**
 * The read path any lawful consumer uses: one committed Institution Identity, by its exact canonical `institution_id`
 * (GIP Scaling Profile v1.1 §5: retrieval is keyed by the current governance question, never a scan of institutions). It
 * takes only the read side of a store, so reading grants no write authority, and it returns undefined for an institution that
 * is not established — nothing is created, inferred or defaulted by a read.
 */
export function readInstitutionIdentity(
  store: Pick<CampaignStore, "getFact">,
  institutionId: string,
): TypedInstitutionIdentity | undefined {
  const fact = store.getFact(gipInstitutionIdentityKey(institutionId));
  if (!fact) return undefined;
  const value = InstitutionIdentitySchema.safeParse(fact.value);
  return value.success ? { fact, value: value.data } : undefined;
}

/**
 * IM-06 GIP — the authored path of the GIP owner.
 *
 * A caller supplies authored content and identities. It never supplies an owner, a facet, an authority or a governing rule:
 * those come from the specification-backed registry, and the publication is made by the archivist path through the existing
 * IM-11/IM-12/IM-17 store (one journal, one canon). There is exactly ONE authored publication: the explicit establishment
 * of one continuing institution's identity. Nothing else creates one — not a label, a population or cohort, a culture, a
 * charter text, a faction, a treaty, a settlement or any organization-like object — and there is no rename, split, merge,
 * abolition, replacement, succession, office, authority, instrument, membership or property method, no tick, scan or
 * scheduler, and no way to write another owner's fact, so no caller can write GIP state out of order; the store's admission
 * refuses it for a raw commit as well.
 *
 * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity (RC-16): identical input
 * reaches the original receipt, and a changed input is refused as a conflict rather than silently reusing it. A conflicting
 * establishment for an already-established institution is refused by the sealed, create-only identity slot and never rewrites
 * it. Nothing is re-rolled or improved: no randomness exists here.
 */
export class GipAdapter {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /**
   * Commits one Institution Identity for one explicitly established continuing institution. It reads and depends on nothing
   * foreign and writes exactly one create-only key. The record's basis and secrecy are the caller's authored input, never
   * defaulted (the world-foundation publication rule).
   */
  async establishInstitution(
    input: Publication & { readonly institution: unknown },
  ): Promise<Result<CommitOutcome, GipErrorCode>> {
    const p = PublicationSchema.safeParse({
      group_id: input.group_id,
      intent_id: input.intent_id,
      cause: input.cause,
      basis: input.basis,
      secrecy: input.secrecy,
    });
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const institution = InstitutionIdentitySchema.safeParse(input.institution);
    if (!institution.success)
      return fail("INPUT_INVALID", "institution identity failed validation", {
        issues: issues(institution.error),
      });
    return this.#publish(p.data, institution.data);
  }

  // -- typed read, by identity (none scans) ----------------------------------------------------

  /** The committed Institution Identity, or undefined. Reading it transfers no GIP write authority. */
  institutionIdentity(institutionId: string): TypedInstitutionIdentity | undefined {
    return readInstitutionIdentity(this.#store, institutionId);
  }

  async #publish(
    p: Publication,
    value: InstitutionIdentity,
  ): Promise<Result<CommitOutcome, GipErrorCode>> {
    const kind = factKind("gip_institution_identity");
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.group_id,
      intent_id: p.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.cause,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [],
      depends_on: [],
      writes: [
        {
          key: gipInstitutionIdentityKey(value.institution_id),
          owner: kind.owner,
          facet: kind.facet,
          value: value as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: p.basis,
          secrecy: p.secrecy,
          expected_version: 0,
        },
      ],
    };
    return this.#store.commit(group);
  }
}
