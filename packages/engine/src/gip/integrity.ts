import {
  GovernanceInstrumentSchema,
  InstitutionIdentitySchema,
  OWNER_GIP,
  OfficeAuthorityLocusSchema,
  ScopeBindingSchema,
  TemporalObjectSchema,
  gipInstitutionIdentityKey,
  gipInstrumentKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
  parseInstrumentScopeBindingRef,
  parseInstrumentSourceAuthorityRef,
  type OwnerFact,
} from "@immortalis/contracts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { gipObjectViolation } from "./declaration.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's GIP state still tells one story (IM-12
 * replay/recovery + IM-06). Replay proves the HISTORY is intact and canonical integrity proves each fact's owner, schema, key
 * identity, governing rule and authority; this proves the GIP facts still cohere:
 *
 *  - an Institution Identity is at the key its canonical `institution_id` derives, is one create-only version and was
 *    committed by a group that wrote exactly that one key and read and depended on nothing foreign (so it is GIP's own
 *    identity record and a loaded campaign cannot hold an identity another path created beside its own);
 *  - an Office / Authority Locus is at the key its exact `institution_id` and `office_id` derive, is still its one first
 *    version (no transition is implemented, so a loaded office that has moved forward was not made by a lawful path), rests
 *    on a committed GIP Institution Identity with that exact `institution_id` (a label never joins), and was committed by a
 *    group that wrote exactly that one key at expected version zero and read and depended on exactly that identity — at the
 *    identity's own version and committing group — and nothing else (so no foreign read, actor, holder state or sibling
 *    authority was part of it); its governing-rule provenance is re-checked with every fact by canonical integrity;
 *  - an Authority Scope Binding is at the key its exact `institution_id`, `office_id` and `scope_binding_id` derive, is still its
 *    one first version (no transition is implemented), rests on a committed GIP Office / Authority Locus with that exact
 *    `institution_id` and `office_id` whose own Institution Identity ancestry is still committed, and was committed by a group
 *    that wrote exactly that one key at expected version zero and read and depended on exactly that office — at the office's
 *    own version and committing group — and nothing else (so no foreign read, resolved reference, per-subject copy or sibling
 *    binding was part of it); its governing-rule provenance is re-checked with every fact by canonical integrity;
 *  - a Governance Instrument is at the key its exact `instrument_id` derives, is still its one first version (no transition is
 *    implemented), addresses a committed Office / Authority Locus and a committed Scope Binding of that same office, each with its
 *    exact identities and its Institution Identity ancestry still committed, and was committed by a group that wrote exactly that
 *    one key at expected version zero and read and depended on exactly that office and that binding — each at its own version and
 *    committing group — and nothing else (so no dereferenced authority basis or governing order, foreign read, clause, per-order or
 *    per-recipient copy or sibling Instrument was part of it); its governing-rule provenance is re-checked with every fact by
 *    canonical integrity;
 *  - no temporal object declares a GIP stage, close or owned object: GIP has no tick, phase or polling loop.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyGipIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) => out.push({ key, code: "GIP_STATE", message });
  const all = store.listFacts();
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;

  for (const f of all) {
    if (kindOf(f) === "gip_institution_identity") {
      const parsed = InstitutionIdentitySchema.safeParse(f.value);
      if (!parsed.success) continue;
      if (f.key !== gipInstitutionIdentityKey(parsed.data.institution_id)) {
        bad(
          f.key,
          "an Institution Identity is at the key derived from its canonical institution_id",
        );
        continue;
      }
      const group = store.committedGroup(f.provenance.intent_id);
      if (
        !group ||
        group.writes.length !== 1 ||
        group.writes[0]!.key !== f.key ||
        group.reads.length !== 0 ||
        group.depends_on.length !== 0
      ) {
        bad(
          f.key,
          "an Institution Identity is GIP's own identity record: one write, no foreign read or dependency",
        );
      }
    } else if (kindOf(f) === "gip_office_authority_locus") {
      verifyOffice(store, f, bad);
    } else if (kindOf(f) === "gip_scope_binding") {
      verifyScopeBinding(store, f, bad);
    } else if (kindOf(f) === "gip_governance_instrument") {
      verifyInstrument(store, f, bad);
    } else if (kindOf(f) === "temporal_object") {
      const o = TemporalObjectSchema.safeParse(f.value);
      const violation = o.success ? gipObjectViolation(o.data) : null;
      if (violation) bad(f.key, violation);
    }
  }
  return out;
}

function verifyOffice(
  store: CampaignStore,
  f: OwnerFact,
  bad: (key: string, message: string) => void,
): void {
  const parsed = OfficeAuthorityLocusSchema.safeParse(f.value);
  if (!parsed.success) return; // canonical integrity reports a value that violates its contract
  const office = parsed.data;
  if (f.key !== gipOfficeAuthorityLocusKey(office.institution_id, office.office_id)) {
    bad(f.key, "an office is at the key derived from its exact institution_id and office_id");
    return;
  }
  if (f.version !== 1) {
    bad(
      f.key,
      "no office transition is implemented: an office is still the version it was established as",
    );
    return;
  }
  const identityKey = gipInstitutionIdentityKey(office.institution_id);
  const identity = store.getFact(identityKey);
  const identityValue = identity ? InstitutionIdentitySchema.safeParse(identity.value) : undefined;
  if (
    !identity ||
    identity.owner !== OWNER_GIP ||
    !identityValue?.success ||
    identityValue.data.institution_id !== office.institution_id
  ) {
    bad(f.key, "an office rests on a committed Institution Identity with its exact institution_id");
    return;
  }
  const group = store.committedGroup(f.provenance.intent_id);
  if (
    !group ||
    group.writes.length !== 1 ||
    group.writes[0]!.key !== f.key ||
    group.writes[0]!.expected_version !== 0 ||
    group.reads.length !== 1 ||
    group.reads[0]!.key !== identityKey ||
    group.reads[0]!.version !== identity.version ||
    group.depends_on.length !== 1 ||
    group.depends_on[0] !== identity.provenance.group_id
  ) {
    bad(
      f.key,
      "an office was established by one create-only write that pinned exactly its committed Institution Identity and nothing else",
    );
  }
}

function verifyScopeBinding(
  store: CampaignStore,
  f: OwnerFact,
  bad: (key: string, message: string) => void,
): void {
  const parsed = ScopeBindingSchema.safeParse(f.value);
  if (!parsed.success) return; // canonical integrity reports a value that violates its contract
  const binding = parsed.data;
  if (
    f.key !==
    gipScopeBindingKey(binding.institution_id, binding.office_id, binding.scope_binding_id)
  ) {
    bad(
      f.key,
      "a scope binding is at the key derived from its exact institution_id, office_id and scope_binding_id",
    );
    return;
  }
  if (f.version !== 1) {
    bad(
      f.key,
      "no scope binding transition is implemented: a binding is still the version it was established as",
    );
    return;
  }
  const officeKey = gipOfficeAuthorityLocusKey(binding.institution_id, binding.office_id);
  const office = store.getFact(officeKey);
  const officeValue = office ? OfficeAuthorityLocusSchema.safeParse(office.value) : undefined;
  if (
    !office ||
    office.owner !== OWNER_GIP ||
    !officeValue?.success ||
    officeValue.data.institution_id !== binding.institution_id ||
    officeValue.data.office_id !== binding.office_id
  ) {
    bad(
      f.key,
      "a scope binding rests on a committed Office / Authority Locus with its exact institution_id and office_id",
    );
    return;
  }
  const identity = store.getFact(gipInstitutionIdentityKey(binding.institution_id));
  const identityValue = identity ? InstitutionIdentitySchema.safeParse(identity.value) : undefined;
  if (
    !identity ||
    identity.owner !== OWNER_GIP ||
    !identityValue?.success ||
    identityValue.data.institution_id !== binding.institution_id
  ) {
    bad(
      f.key,
      "a scope binding's office rests on a committed Institution Identity with its exact institution_id",
    );
    return;
  }
  const group = store.committedGroup(f.provenance.intent_id);
  if (
    !group ||
    group.writes.length !== 1 ||
    group.writes[0]!.key !== f.key ||
    group.writes[0]!.expected_version !== 0 ||
    group.reads.length !== 1 ||
    group.reads[0]!.key !== officeKey ||
    group.reads[0]!.version !== office.version ||
    group.depends_on.length !== 1 ||
    group.depends_on[0] !== office.provenance.group_id
  ) {
    bad(
      f.key,
      "a scope binding was established by one create-only write that pinned exactly its committed parent office and nothing else",
    );
  }
}

function verifyInstrument(
  store: CampaignStore,
  f: OwnerFact,
  bad: (key: string, message: string) => void,
): void {
  const parsed = GovernanceInstrumentSchema.safeParse(f.value);
  if (!parsed.success) return; // canonical integrity reports a value that violates its contract
  const instrument = parsed.data;
  if (f.key !== gipInstrumentKey(instrument.instrument_id)) {
    bad(f.key, "an Instrument is at the key derived from its exact instrument_id");
    return;
  }
  if (f.version !== 1) {
    bad(
      f.key,
      "no Instrument transition is implemented: an Instrument is still the version it was established as",
    );
    return;
  }
  const officeRef = parseInstrumentSourceAuthorityRef(instrument.source_authority_ref);
  const bindingRef = parseInstrumentScopeBindingRef(instrument.scope_binding_ref);
  if (
    !officeRef ||
    !bindingRef ||
    bindingRef.institution_id !== officeRef.institution_id ||
    bindingRef.office_id !== officeRef.office_id
  ) {
    bad(
      f.key,
      "an Instrument's scope_binding_ref addresses a Scope Binding of the same authority as its source_authority_ref",
    );
    return;
  }
  const officeKey = gipOfficeAuthorityLocusKey(officeRef.institution_id, officeRef.office_id);
  const office = store.getFact(officeKey);
  const officeValue = office ? OfficeAuthorityLocusSchema.safeParse(office.value) : undefined;
  if (
    !office ||
    office.owner !== OWNER_GIP ||
    !officeValue?.success ||
    officeValue.data.institution_id !== officeRef.institution_id ||
    officeValue.data.office_id !== officeRef.office_id
  ) {
    bad(
      f.key,
      "an Instrument rests on a committed Office / Authority Locus with its exact institution_id and office_id",
    );
    return;
  }
  const bindingKey = gipScopeBindingKey(
    bindingRef.institution_id,
    bindingRef.office_id,
    bindingRef.scope_binding_id,
  );
  const binding = store.getFact(bindingKey);
  const bindingValue = binding ? ScopeBindingSchema.safeParse(binding.value) : undefined;
  if (
    !binding ||
    binding.owner !== OWNER_GIP ||
    !bindingValue?.success ||
    bindingValue.data.institution_id !== officeRef.institution_id ||
    bindingValue.data.office_id !== officeRef.office_id ||
    bindingValue.data.scope_binding_id !== bindingRef.scope_binding_id
  ) {
    bad(
      f.key,
      "an Instrument rests on a committed Scope Binding of the same office authority, with its exact scope_binding_id",
    );
    return;
  }
  const identity = store.getFact(gipInstitutionIdentityKey(officeRef.institution_id));
  const identityValue = identity ? InstitutionIdentitySchema.safeParse(identity.value) : undefined;
  if (
    !identity ||
    identity.owner !== OWNER_GIP ||
    !identityValue?.success ||
    identityValue.data.institution_id !== officeRef.institution_id
  ) {
    bad(
      f.key,
      "an Instrument's source office rests on a committed Institution Identity with its exact institution_id",
    );
    return;
  }
  const group = store.committedGroup(f.provenance.intent_id);
  const readsOk =
    !!group &&
    group.reads.length === 2 &&
    group.reads.some((r) => r.key === officeKey && r.version === office.version) &&
    group.reads.some((r) => r.key === bindingKey && r.version === binding.version);
  const dependsOk =
    !!group &&
    group.depends_on.length === 2 &&
    group.depends_on.some((d) => d === office.provenance.group_id) &&
    group.depends_on.some((d) => d === binding.provenance.group_id);
  if (
    !group ||
    group.writes.length !== 1 ||
    group.writes[0]!.key !== f.key ||
    group.writes[0]!.expected_version !== 0 ||
    !readsOk ||
    !dependsOk
  ) {
    bad(
      f.key,
      "an Instrument was established by one create-only write that pinned exactly its committed source office and its committed Scope Binding and nothing else",
    );
  }
}
