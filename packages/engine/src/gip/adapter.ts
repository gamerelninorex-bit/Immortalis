import {
  CANON_WRITE_AUTHORITY,
  GovernanceInstrumentSchema,
  InstitutionIdentitySchema,
  OfficeAuthorityLocusSchema,
  PublicationSchema,
  ScopeBindingSchema,
  fail,
  gipInstitutionIdentityKey,
  gipInstrumentKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
  parseInstrumentScopeBindingRef,
  parseInstrumentSourceAuthorityRef,
  type CommitGroup,
  type GovernanceInstrument,
  type InstitutionIdentity,
  type OfficeAuthorityLocus,
  type ScopeBinding,
  type OwnerFact,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { factKind, type FactKindId } from "../owners/registry.ts";
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

/** A committed Office / Authority Locus read by exact key: the fact (with its provenance) and its typed value. */
export interface TypedOfficeAuthorityLocus {
  readonly fact: OwnerFact;
  readonly value: OfficeAuthorityLocus;
}

/**
 * The read path any lawful consumer uses: one committed Office / Authority Locus, by its exact canonical `institution_id`
 * and `office_id` (GIP Scaling Profile v1.1 §5: retrieval is keyed by the current governance question, never a scan of
 * institutions or offices). It takes only the read side of a store, so reading grants no write authority, and it returns
 * undefined for an office that is not established — nothing is created, inferred or defaulted by a read. It reports what the
 * office record says (authority at the office, `holder_ref` or `decision_body_ref` a bare reference); it infers no exercise,
 * reach, membership or knowledge.
 */
export function readOfficeAuthorityLocus(
  store: Pick<CampaignStore, "getFact">,
  institutionId: string,
  officeId: string,
): TypedOfficeAuthorityLocus | undefined {
  const fact = store.getFact(gipOfficeAuthorityLocusKey(institutionId, officeId));
  if (!fact) return undefined;
  const value = OfficeAuthorityLocusSchema.safeParse(fact.value);
  return value.success ? { fact, value: value.data } : undefined;
}

/** A committed Authority Scope Binding read by exact key: the fact (with its provenance) and its typed value. */
export interface TypedScopeBinding {
  readonly fact: OwnerFact;
  readonly value: ScopeBinding;
}

/**
 * The read path any lawful consumer uses: one committed Scope Binding, by its exact canonical `institution_id`, `office_id`
 * and `scope_binding_id` (GIP Scaling Profile v1.1 §5: retrieval is keyed by the current governance question, never a scan of
 * institutions, offices or bindings). It takes only the read side of a store, so reading grants no write authority, and it
 * returns undefined for a binding that is not established — nothing is created, inferred or defaulted by a read. It reports
 * what the binding record says: it resolves no scope, exception or priority-or-conflict reference and returns no applicability result.
 */
export function readScopeBinding(
  store: Pick<CampaignStore, "getFact">,
  institutionId: string,
  officeId: string,
  scopeBindingId: string,
): TypedScopeBinding | undefined {
  const fact = store.getFact(gipScopeBindingKey(institutionId, officeId, scopeBindingId));
  if (!fact) return undefined;
  const value = ScopeBindingSchema.safeParse(fact.value);
  return value.success ? { fact, value: value.data } : undefined;
}

/** A committed Governance Instrument record read by exact key: the fact (with its provenance) and its typed value. */
export interface TypedGovernanceInstrument {
  readonly fact: OwnerFact;
  readonly value: GovernanceInstrument;
}

/**
 * The read path any lawful consumer uses: one committed Governance Instrument record, by its exact canonical
 * `instrument_id` (GIP Scaling Profile v1.1 §5: retrieval is keyed by the current governance question, never a scan of
 * institutions, offices, bindings, instruments, orders, recipients or subjects). It takes only the read side of a store, so
 * reading grants no write authority, and it returns undefined for an Instrument that is not established — nothing is created,
 * inferred or defaulted by a read. It reports what the record says: it dereferences no authority basis or governing order,
 * calculates no validity or lifecycle and returns no applicability result.
 */
export function readGovernanceInstrument(
  store: Pick<CampaignStore, "getFact">,
  instrumentId: string,
): TypedGovernanceInstrument | undefined {
  const fact = store.getFact(gipInstrumentKey(instrumentId));
  if (!fact) return undefined;
  const value = GovernanceInstrumentSchema.safeParse(fact.value);
  return value.success ? { fact, value: value.data } : undefined;
}

/**
 * IM-06 GIP — the authored path of the GIP owner.
 *
 * A caller supplies authored content and identities. It never supplies an owner, a facet, an authority or a governing rule:
 * those come from the specification-backed registry, and the publication is made by the archivist path through the existing
 * IM-11/IM-12/IM-17 store (one journal, one canon). There are exactly FOUR authored publications: the explicit establishment
 * of one continuing institution's identity, the explicit establishment of one office beneath it, the explicit establishment
 * of one scope binding beneath that office, and the explicit establishment of one Governance Instrument record beneath
 * that office and one of its scope bindings. Nothing else creates
 * either — not a label, a population or cohort, a culture, a charter text, a faction, a treaty, a settlement or any
 * organization-like object — and there is no rename, split, merge, abolition, replacement, appointment, removal, succession,
 * delegation, authority amendment, holder replacement, instrument amendment, enactment, validity or lifecycle method, clause, membership or property method, no tick, scan or
 * scheduler, and no way to write another owner's fact, so no caller can write GIP state out of order; the store's admission
 * refuses it for a raw commit as well.
 *
 * An office's one prerequisite is its institution's committed Institution Identity, read by exact key; the adapter pins it
 * (read at its current version, depended on) and nothing else. Authority is persisted at the office; `holder_ref` or
 * `decision_body_ref` (exactly one, enforced by the strict office contract) is a bare reference that is never resolved, and the
 * adapter writes no actor, decision-body, Population, KTI, Epistemic, Economy or other foreign state.
 *
 * A Scope Binding's one prerequisite is its parent office, read by exact key; the adapter pins it (read at its current version,
 * depended on) and nothing else. The binding's `scope_ref`, `exception_refs[]` and `priority_or_conflict_rule_ref` are opaque authored values that
 * are never resolved, and its `target_condition` and `inheritance_rule` are authored text that is never parsed or executed.
 *
 * A Governance Instrument's two prerequisites are its source office and its Scope Binding of that same office, each read by exact
 * key; the adapter pins them (each read at its current version, depended on) and nothing else. Its `authority_basis_ref` and each
 * `governing_order_ref` are opaque authored values that are never dereferenced, and its validity and lifecycle are authored values
 * that the engine never calculates, advances or applies: establishment here is not enactment and runs no decision procedure. An
 * optional `predecessor_instrument_ref` is likewise an opaque authored reference that is never dereferenced and adds no prerequisite.
 *
 * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity (RC-16): identical input
 * reaches the original receipt, and a changed input is refused as a conflict rather than silently reusing it. A conflicting
 * establishment for an already-established institution is refused by the sealed, create-only identity slot and never rewrites
 * it; a conflicting establishment for an occupied office is likewise refused and never mints a sibling authority, and no
 * path updates an established office. Nothing is re-rolled or improved: no randomness exists here.
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
    const value = institution.data;
    return this.#publish(
      p.data,
      "gip_institution_identity",
      gipInstitutionIdentityKey(value.institution_id),
      value,
      [],
      [],
    );
  }

  /**
   * Commits the initial establishment of one Office / Authority Locus beneath one already-committed Institution Identity,
   * joined by the exact `institution_id`. It reads exactly that identity (by key, at its current version) and depends on
   * the group that committed it, and writes exactly one create-only office key. Every authority, rule and reference value is
   * the caller's authored input: nothing is defaulted, guessed from a label or derived from the identity, a holder or a decision
   * body, and the reference branch (`holder_ref` or `decision_body_ref`) does not change the key, the prerequisite or the
   * write. If the
   * institution is not established, the reads are pinned at version zero and admission refuses the group as a missing
   * prerequisite; nothing is created. There is no update, appointment, removal, succession, delegation or holder-change
   * method: an established office is never rewritten.
   */
  async establishOffice(
    input: Publication & { readonly office: unknown },
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
    const office = OfficeAuthorityLocusSchema.safeParse(input.office);
    if (!office.success)
      return fail("INPUT_INVALID", "office failed validation", { issues: issues(office.error) });
    const value = office.data;
    const prerequisite = this.#store.getFact(gipInstitutionIdentityKey(value.institution_id));
    return this.#publish(
      p.data,
      "gip_office_authority_locus",
      gipOfficeAuthorityLocusKey(value.institution_id, value.office_id),
      value,
      [
        {
          key: gipInstitutionIdentityKey(value.institution_id),
          version: prerequisite?.version ?? 0,
        },
      ],
      prerequisite ? [prerequisite.provenance.group_id] : [],
    );
  }

  /**
   * Commits the initial establishment of one Authority Scope Binding beneath one already-committed Office / Authority Locus,
   * joined by the exact `institution_id` and `office_id`. It reads exactly that office (by key, at its current version) and
   * depends on the group that committed it, and writes exactly one create-only binding key. Every value is the caller's
   * authored input: nothing is defaulted, guessed from a label or the office's prose, or derived from a holder, a decision body
   * or any foreign owner, and the office's reference branch does not change the key, the prerequisite or the write. If the
   * office is not established, the read is pinned at version zero and admission refuses the group as a missing prerequisite;
   * nothing is created. There is no update, replacement, inheritance, exception, priority or conflict method: an established binding is
   * never rewritten.
   */
  async establishScopeBinding(
    input: Publication & { readonly scope_binding: unknown },
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
    const binding = ScopeBindingSchema.safeParse(input.scope_binding);
    if (!binding.success)
      return fail("INPUT_INVALID", "scope binding failed validation", {
        issues: issues(binding.error),
      });
    const value = binding.data;
    const officeKey = gipOfficeAuthorityLocusKey(value.institution_id, value.office_id);
    const prerequisite = this.#store.getFact(officeKey);
    return this.#publish(
      p.data,
      "gip_scope_binding",
      gipScopeBindingKey(value.institution_id, value.office_id, value.scope_binding_id),
      value,
      [{ key: officeKey, version: prerequisite?.version ?? 0 }],
      prerequisite ? [prerequisite.provenance.group_id] : [],
    );
  }

  /**
   * Commits the initial establishment of one Governance Instrument record beneath one already-committed Office / Authority
   * Locus and one already-committed Scope Binding of that same office, each addressed by the exact reference the Instrument
   * itself carries. It reads exactly those two facts (by key, at their current versions), depends on the groups that
   * committed them, and writes exactly one create-only Instrument key derived from its `instrument_id` alone. Every value is the
   * caller's authored input: nothing is defaulted, inferred or calculated, and the office's reference branch does not change
   * the key, the prerequisites or the write. If a prerequisite is not established, its read is pinned at version zero and
   * admission refuses the group as a missing prerequisite; nothing is created. An optional `predecessor_instrument_ref` is
   * carried as authored like every other value: it adds no read, dependency or write, and the predecessor it names is never
   * looked up. There is no update, validity, lifecycle, clause,
   * amendment or enactment method: an established Instrument is never rewritten.
   */
  async establishGovernanceInstrument(
    input: Publication & { readonly instrument: unknown },
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
    const instrument = GovernanceInstrumentSchema.safeParse(input.instrument);
    if (!instrument.success)
      return fail("INPUT_INVALID", "governance instrument failed validation", {
        issues: issues(instrument.error),
      });
    const value = instrument.data;
    // the contract's own cross-check guarantees both references parse and name one authority
    const office = parseInstrumentSourceAuthorityRef(value.source_authority_ref)!;
    const binding = parseInstrumentScopeBindingRef(value.scope_binding_ref)!;
    const officeKey = gipOfficeAuthorityLocusKey(office.institution_id, office.office_id);
    const bindingKey = gipScopeBindingKey(
      binding.institution_id,
      binding.office_id,
      binding.scope_binding_id,
    );
    const officeFact = this.#store.getFact(officeKey);
    const bindingFact = this.#store.getFact(bindingKey);
    return this.#publish(
      p.data,
      "gip_governance_instrument",
      gipInstrumentKey(value.instrument_id),
      value,
      [
        { key: officeKey, version: officeFact?.version ?? 0 },
        { key: bindingKey, version: bindingFact?.version ?? 0 },
      ],
      [
        ...(officeFact ? [officeFact.provenance.group_id] : []),
        ...(bindingFact ? [bindingFact.provenance.group_id] : []),
      ],
    );
  }

  // -- typed read, by identity (none scans) ----------------------------------------------------

  /** The committed Institution Identity, or undefined. Reading it transfers no GIP write authority. */
  institutionIdentity(institutionId: string): TypedInstitutionIdentity | undefined {
    return readInstitutionIdentity(this.#store, institutionId);
  }

  /** One office of one institution, or undefined. Reading it transfers no GIP write authority. */
  officeAuthorityLocus(
    institutionId: string,
    officeId: string,
  ): TypedOfficeAuthorityLocus | undefined {
    return readOfficeAuthorityLocus(this.#store, institutionId, officeId);
  }

  /** One scope binding of one office, or undefined. Reading it transfers no GIP write authority and resolves nothing. */
  scopeBinding(
    institutionId: string,
    officeId: string,
    scopeBindingId: string,
  ): TypedScopeBinding | undefined {
    return readScopeBinding(this.#store, institutionId, officeId, scopeBindingId);
  }

  /** One Governance Instrument record, or undefined. Reading it transfers no GIP write authority and resolves nothing. */
  governanceInstrument(instrumentId: string): TypedGovernanceInstrument | undefined {
    return readGovernanceInstrument(this.#store, instrumentId);
  }

  async #publish(
    p: Publication,
    kindId: FactKindId,
    key: string,
    value: InstitutionIdentity | OfficeAuthorityLocus | ScopeBinding | GovernanceInstrument,
    reads: CommitGroup["reads"],
    depends_on: readonly string[],
  ): Promise<Result<CommitOutcome, GipErrorCode>> {
    const kind = factKind(kindId);
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.group_id,
      intent_id: p.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.cause,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads,
      depends_on: [...depends_on],
      writes: [
        {
          key,
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
