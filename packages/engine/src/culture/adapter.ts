import {
  ACCESS_CLASS_CULTURE_ENGINE_SIDE,
  CANON_WRITE_AUTHORITY,
  CultureSharedMeaningSchema,
  CultureUpdateContextSchema,
  PublicationSchema,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
  fail,
  type CommitGroup,
  type CultureSharedMeaning,
  type CultureUpdateContext,
  type OwnerFact,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import { contextPinnedKeys } from "./admission.ts";

export type CultureErrorCode = StoreCommitErrorCode | "INPUT_INVALID";

/**
 * What a caller supplies for an authored publication: identities and a basis label. The access class is never the
 * caller's: a Culture fact is engine-side, so the owner stamps it itself.
 */
export type CulturePublication = Omit<Publication, "secrecy">;

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);

/**
 * IM-09 Culture & Society — the authored path of the Culture owner.
 *
 * A caller supplies the question and the engaged inputs, nothing more. It never supplies an owner, a facet, an authority, a
 * secrecy class, a governing rule or — above all — a meaning, norm or manifestation: those are derived from the committed
 * evidence, and the publication is made by the archivist path through the existing IM-11/IM-12/IM-17 store (one journal, one
 * canon). There is exactly ONE authored publication: the sealed Social Update Context. The shared meaning/norm is NOT a
 * method here: it is the `cultureConventionCloseProvider` operation the IM-02 coordinator resolves as the owner's declared
 * Communicative Convention Close, inside the engaged object of the dependent consequence that materially requires it. There
 * is no fact writer, no setter, no update, rebinding, contestation, retirement, relation, position, prevalence or adoption
 * method, and no way to write a foreign fact, so no caller can write Culture state out of order; the store's admission
 * refuses it for a raw commit as well.
 *
 * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity (RC-16): the group is
 * rebuilt on the basis it was committed against, so identical input reaches the original receipt, and a changed input is
 * refused as a conflict rather than silently reusing it. Nothing is re-rolled or improved: no randomness exists here.
 */
export class CultureAdapter {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /**
   * Seals one Social Update Context (CS-UPD). It pins, at their current versions and never copied, the bound canonical
   * referent and scope and every engaged input. It is create-only: one slot per referent × scope × context distinction. It is
   * NOT the shared meaning: that exists only at its Communicative Convention Close.
   */
  async sealUpdateContext(
    input: CulturePublication & { readonly context: unknown },
  ): Promise<Result<CommitOutcome, CultureErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const context = CultureUpdateContextSchema.safeParse(input.context);
    if (!context.success)
      return fail("INPUT_INVALID", "update context failed validation", {
        issues: issues(context.error),
      });
    const c = context.data;
    const key = cultureUpdateContextKey(c.update_id);
    const prior = this.#store.committedGroup(p.data.intent_id);
    let reads: CommitGroup["reads"];
    let depends_on: readonly string[];
    if (prior && prior.writes.some((w) => w.key === key)) {
      // reconcile by identity: rebuild on the committed basis
      reads = prior.reads;
      depends_on = prior.depends_on;
    } else {
      const pinned = contextPinnedKeys(c);
      reads = pinned.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 }));
      depends_on = [
        ...new Set(pinned.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? [])),
      ];
    }
    const kind = factKind("culture_update_context");
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.data.group_id,
      intent_id: p.data.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.data.cause,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads,
      depends_on: [...depends_on],
      writes: [
        {
          key,
          owner: kind.owner,
          facet: kind.facet,
          value: c as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: p.data.basis,
          secrecy: ACCESS_CLASS_CULTURE_ENGINE_SIDE,
          expected_version: 0,
        },
      ],
    };
    return this.#store.commit(group);
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  /** The sealed Social Update Context, or undefined. Owner-side provenance: not a cross-owner read. */
  updateContext(updateId: string): { fact: OwnerFact; value: CultureUpdateContext } | undefined {
    const fact = this.#store.getFact(cultureUpdateContextKey(updateId));
    return fact ? { fact, value: CultureUpdateContextSchema.parse(fact.value) } : undefined;
  }

  /**
   * The established shared meaning/norm as it stands at the Communicative Convention Close, with the group that committed the
   * close; undefined until the close has committed. A fact that is not committed is never visible.
   */
  sharedMeaning(
    updateId: string,
  ): { fact: OwnerFact; value: CultureSharedMeaning; close_group: string } | undefined {
    const fact = this.#store.getFact(cultureSharedMeaningKey(updateId));
    return fact
      ? {
          fact,
          value: CultureSharedMeaningSchema.parse(fact.value),
          close_group: fact.provenance.group_id,
        }
      : undefined;
  }
}

const pick = (i: CulturePublication): Publication => ({
  group_id: i.group_id,
  intent_id: i.intent_id,
  cause: i.cause,
  basis: i.basis,
  secrecy: ACCESS_CLASS_CULTURE_ENGINE_SIDE,
});
