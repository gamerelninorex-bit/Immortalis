import {
  GIP_SUNSET_ENROLLMENT_KEY,
  InstitutionIdentitySchema,
  OWNER_GIP,
  GovernanceInstrumentSchema,
  OfficeAuthorityLocusSchema,
  ScopeBindingSchema,
  SunsetEnrollmentSchema,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  TransactionAuthoritySchema,
  compareTime,
  gipInstitutionIdentityKey,
  gipInstrumentKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
  gipSunsetBoundaryId,
  gipSunsetObjectId,
  gipSunsetStage,
  parseInstrumentScopeBindingRef,
  parseInstrumentSourceAuthorityRef,
  temporalObjectKey,
  temporalTransactionAuthorityKey,
  timeEquals,
  type CanonicalTime,
  type CommitGroup,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import {
  GIP_INSTRUMENT_RULE,
  GIP_OFFICE_RULE,
  GIP_SCOPE_BINDING_RULE,
  resolveKey,
} from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import { deriveSunsetExpiry } from "./derive.ts";
import {
  gipObjectViolation,
  instrumentSourceKeys,
  pendingSunsetEnrollment,
  sunsetReachViolation,
} from "./declaration.ts";

/**
 * IM-11 admission for the IM-06 GIP owner (IM-03 owner resolution; GIP Draft v2.1 §§2.1, 2.2, 3.1, 3.2; Scaling Profile v1.1
 * §3). Pure: a function of (group, state) only, so it holds for a raw `store.commit` as much as for the owner path.
 * Key-space exclusivity (nobody but `gip`/`gip_institution_identity` can write a `gip/…` key, and the GIP owner can write
 * no canonical, kernel, Population, Production, Economy, World-State, Logistics, Named-Actor, Epistemic or KTI key) is
 * enforced by the owner registry before this runs; this enforces that even the GIP owner can change its state in exactly
 * four lawful establishments and one lifecycle transition (the fifth and sixth ways below):
 *
 *  1. INSTITUTION IDENTITY: one identity/provenance record for one continuing institution, at the one key its canonical
 *     `institution_id` derives. It is GIP's own definition: it reads and depends on no foreign fact (a label, a population,
 *     a culture, a charter, a faction, a treaty or a settlement is never a prerequisite, hence never a trigger), and the
 *     group writes nothing else, so establishing an institution creates no office, procedure, instrument, authority,
 *     membership, faction agency, KTI state, awareness or downstream behavior. Create-only (SEALED).
 *  2. OFFICE / AUTHORITY LOCUS: one office of one already-committed institution, at the one key its exact `institution_id`
 *     and `office_id` derive, created once. It rests on exactly one committed fact it pins — that institution's Institution
 *     Identity, read by exact key at its current version and depended on — so a label, a population, a text or any other
 *     path never substitutes for the canonical identity, and an office cannot precede its institution. It resolves no
 *     `authority_source_ref`, `holder_ref` or `decision_body_ref` (exactly one reference branch, an opaque reference whichever
 *     it is; the strict contract refuses both and neither) and reads no actor or decision body, so it copies no authority, personality, capability,
 *     knowledge or permission anywhere and writes nothing else. The kind is ADVANCING because a later lawful cause may move
 *     an office forward under its own expected-version chain; NO such transition exists yet, so every write to an office
 *     other than its first creation (expected version 0) is refused here as not supported, and a second creation of an
 *     occupied slot is refused by the store's version chain. No sibling record, ledger or second authority is minted.
 *  3. AUTHORITY SCOPE BINDING: one authored applicability envelope of one already-committed office, at the one key its exact
 *     `institution_id`, `office_id` and `scope_binding_id` derive, created once. It rests on exactly one committed fact it
 *     pins — that office, read by exact key at its current version and depended on — whose own Institution Identity ancestry
 *     must still be committed, so a binding cannot precede, or be attached to a different or forged, office. It resolves no
 *     `scope_ref`, exception or priority-or-conflict reference, reads no foreign owner, parses no `target_condition` or
 *     `inheritance_rule`, never reads or rewrites the office's own text and writes nothing else. The kind is ADVANCING
 *     because a later lawful cause may change a scope; NO such change exists yet, so every write to a binding other than its
 *     first creation (expected version 0) is refused here as not supported, and a second creation of an occupied slot is
 *     refused by the store's version chain. No sibling record, per-subject copy, instrument or applicability result is made.
 *  4. GOVERNANCE INSTRUMENT (the core plus the one optional `predecessor_instrument_ref`): one authored Instrument, at the one key its canonical `instrument_id` alone derives, created
 *     once. It rests on exactly two committed facts it pins — the Office / Authority Locus its `source_authority_ref`
 *     addresses and the Scope Binding its `scope_binding_ref` addresses, each read by exact key at its current version and
 *     depended on — where that binding belongs to that same office, and whose Institution Identity ancestry must still be
 *     committed, so an Instrument cannot precede, or be attached to a different or forged, authority or binding. It
 *     dereferences no `authority_basis_ref` or `governing_order_ref`, reads no holder or decision body, calculates no validity
 *     or lifecycle, applies no decision procedure, carries no conditional field other than the one optional, opaque
 *     `predecessor_instrument_ref` (a bare authored reference: never dereferenced, never read, no dependency, and no read or
 *     write of the predecessor it names) and no clause, and writes nothing else. The kind
 *     is ADVANCING because a later lawful cause may change validity or lifecycle; NO such change exists yet, so every write
 *     to an Instrument other than its first creation (expected version 0) is refused here as not supported, and a second
 *     creation of an occupied slot is refused by the store's version chain. No sibling record, per-recipient, per-subject or
 *     per-order copy, clause, applicability result or implementation state is made.
 *  5. SUNSET-BEARING INSTRUMENT (sunset slice): an Instrument that carries the optional exact `sunset_condition` is created
 *     once, `active`, in ONE group together with GIP's own enrollment receipt for that sunset (the fixed-key
 *     `gip/sunset-enrollment` slot). The sunset must be an instant strictly after canonical time in the same unit, the receipt
 *     repeats exactly the Instrument, the sunset and the canonical time of commit, and a previous receipt must already have been
 *     registered with the Temporal kernel, so at most one enrollment is ever in flight. The Temporal kernel then owns the object
 *     and boundary; an Instrument carrying a sunset is NEVER lawful without its receipt, and the receipt is never lawful alone.
 *  6. SUNSET EXPIRY (sunset slice): the ONE lifecycle transition, `active` to `expired`, of an Instrument that carries a
 *     sunset, only as GIP's own IM-02 stage at the earned boundary the Temporal kernel owns (stage identity, an opened
 *     transaction's durable authority that engaged this very boundary, the Temporal object still holding that boundary, and the
 *     source office and Scope Binding still committed). The new value is exactly the prior value with `lifecycle_status`
 *     expired: every other field, `validity_by_order[]` included, is unchanged. No direct status mutation, other transition,
 *     amendment, supersession, repeal or any other change exists.
 *
 * A retry of the same intent is reconciled by the store by identity (RC-16).
 */
export function gipGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  if (group.writes.length === 2) {
    const [instrument, receipt] = group.writes as [Write, Write];
    if (
      kindOf(instrument.key) === "gip_governance_instrument" &&
      instrument.expected_version === 0 &&
      kindOf(receipt.key) === "gip_sunset_enrollment"
    ) {
      return checkSunsetBearingInstrument(group, state, instrument, receipt);
    }
  }
  if (group.writes.length === 1) {
    const w = group.writes[0]!;
    if (w.expected_version === 0 && kindOf(w.key) === "gip_institution_identity") {
      return checkIdentity(group, w);
    }
    if (kindOf(w.key) === "gip_office_authority_locus") {
      if (w.expected_version !== 0) {
        return reject(
          "AMENDMENT_NOT_SUPPORTED",
          "an office is created once; no appointment, removal, succession, delegation, authority amendment, holder or decision-body change or holder/body switch is implemented",
          { key: w.key },
        );
      }
      return checkOffice(group, state, w);
    }
    if (kindOf(w.key) === "gip_scope_binding") {
      if (w.expected_version !== 0) {
        return reject(
          "AMENDMENT_NOT_SUPPORTED",
          "a scope binding is created once; no scope, inheritance, exception or priority-or-conflict change, replacement or resolution is implemented",
          { key: w.key },
        );
      }
      return checkScopeBinding(group, state, w);
    }
    if (kindOf(w.key) === "gip_governance_instrument") {
      if (w.expected_version !== 0) {
        // the ONE lifecycle transition (active to expired at an earned sunset) exists only as GIP's own Temporal stage
        return checkSunsetExpiry(group, state, w);
      }
      return checkInstrument(group, state, w, false);
    }
  }
  return reject(
    "VALUE_INVALID",
    "GIP state changes only by one Institution Identity, Office / Authority Locus, Authority Scope Binding or Governance Instrument establishment, each created once, and by one Instrument sunset expiry",
  );
}

type Write = CommitGroup["writes"][number];

function checkIdentity(group: CommitGroup, w: Write): Rejection | null {
  const parsed = InstitutionIdentitySchema.safeParse(w.value);
  if (!parsed.success) {
    return reject("VALUE_INVALID", "the Institution Identity violates its contract", {
      key: w.key,
    });
  }
  if (w.key !== gipInstitutionIdentityKey(parsed.data.institution_id)) {
    return reject(
      "REFERENCE_INVALID",
      "an Institution Identity is at the key derived from its canonical institution_id",
      { key: w.key },
    );
  }
  if (group.reads.length !== 0 || group.depends_on.length !== 0) {
    return reject(
      "REFERENCE_INVALID",
      "an Institution Identity is GIP's own identity record: it reads and depends on no foreign fact",
      { key: w.key },
    );
  }
  return null;
}

function checkOffice(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const parsed = OfficeAuthorityLocusSchema.safeParse(w.value);
  if (!parsed.success) {
    return reject("VALUE_INVALID", "the Office / Authority Locus violates its contract", {
      key: w.key,
    });
  }
  const office = parsed.data;
  // a newly committed office, of either reference branch, carries the CURRENT governing-rule citation: the historical
  // thirteenth-slice citation is accepted on load for genuine legacy holder offices only and is never stamped on a new write
  if (!canonicalEqual(group.rule, GIP_OFFICE_RULE)) {
    return reject(
      "REFERENCE_INVALID",
      "an office is committed under the current governing-rule citation of its kind",
      { key: w.key },
    );
  }
  if (w.key !== gipOfficeAuthorityLocusKey(office.institution_id, office.office_id)) {
    return reject(
      "REFERENCE_INVALID",
      "an office is at the key derived from its exact institution_id and office_id",
      { key: w.key },
    );
  }
  // the one prerequisite: the committed Institution Identity, joined by the exact institution_id and nothing else
  const identityKey = gipInstitutionIdentityKey(office.institution_id);
  const pinned = requirePrerequisite(group, state, identityKey, "the Institution Identity");
  if (isRejection(pinned)) return pinned;
  if (group.reads.length !== 1 || group.depends_on.length !== 1) {
    return reject(
      "REFERENCE_INVALID",
      "an office reads and depends on exactly its one committed Institution Identity and nothing else",
      { key: w.key },
    );
  }
  const identity = InstitutionIdentitySchema.safeParse(pinned.fact.value);
  if (
    !identity.success ||
    pinned.fact.owner !== OWNER_GIP ||
    resolveKey(pinned.fact.key)?.kind.id !== "gip_institution_identity" ||
    identity.data.institution_id !== office.institution_id
  ) {
    return reject(
      "REFERENCE_INVALID",
      "the office's institution is a committed GIP Institution Identity with that exact institution_id",
      { key: identityKey },
    );
  }
  return null;
}

function checkScopeBinding(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const parsed = ScopeBindingSchema.safeParse(w.value);
  if (!parsed.success) {
    return reject("VALUE_INVALID", "the Scope Binding violates its contract", { key: w.key });
  }
  const binding = parsed.data;
  if (!canonicalEqual(group.rule, GIP_SCOPE_BINDING_RULE)) {
    return reject(
      "REFERENCE_INVALID",
      "a scope binding is committed under the governing-rule citation of its kind",
      { key: w.key },
    );
  }
  if (
    w.key !==
    gipScopeBindingKey(binding.institution_id, binding.office_id, binding.scope_binding_id)
  ) {
    return reject(
      "REFERENCE_INVALID",
      "a scope binding is at the key derived from its exact institution_id, office_id and scope_binding_id",
      { key: w.key },
    );
  }
  // the one prerequisite: the committed parent office, joined by the exact institution_id and office_id and nothing else
  const officeKey = gipOfficeAuthorityLocusKey(binding.institution_id, binding.office_id);
  const pinned = requirePrerequisite(group, state, officeKey, "the Office / Authority Locus");
  if (isRejection(pinned)) return pinned;
  if (group.reads.length !== 1 || group.depends_on.length !== 1) {
    return reject(
      "REFERENCE_INVALID",
      "a scope binding reads and depends on exactly its one committed parent office and nothing else",
      { key: w.key },
    );
  }
  const office = OfficeAuthorityLocusSchema.safeParse(pinned.fact.value);
  if (
    !office.success ||
    pinned.fact.owner !== OWNER_GIP ||
    resolveKey(pinned.fact.key)?.kind.id !== "gip_office_authority_locus" ||
    office.data.institution_id !== binding.institution_id ||
    office.data.office_id !== binding.office_id
  ) {
    return reject(
      "REFERENCE_INVALID",
      "the binding's parent is a committed GIP Office / Authority Locus with that exact institution_id and office_id",
      { key: officeKey },
    );
  }
  // the office's own ancestry stays intact: its exact Institution Identity is still committed (not pinned again — the office
  // is the one prerequisite, and its own chain is the office's)
  const identityKey = gipInstitutionIdentityKey(binding.institution_id);
  const identityFact = state.facts.get(identityKey);
  const identity = identityFact
    ? InstitutionIdentitySchema.safeParse(identityFact.value)
    : undefined;
  if (
    !identityFact ||
    identityFact.owner !== OWNER_GIP ||
    !identity?.success ||
    identity.data.institution_id !== binding.institution_id
  ) {
    return reject(
      "REFERENCE_INVALID",
      "the binding's office rests on a committed GIP Institution Identity with that exact institution_id",
      { key: identityKey },
    );
  }
  return null;
}

function checkInstrument(
  group: CommitGroup,
  state: CampaignState,
  w: Write,
  enrolled: boolean,
): Rejection | null {
  const parsed = GovernanceInstrumentSchema.safeParse(w.value);
  if (!parsed.success) {
    return reject("VALUE_INVALID", "the Governance Instrument violates its contract", {
      key: w.key,
    });
  }
  const instrument = parsed.data;
  if (instrument.sunset_condition !== undefined && !enrolled) {
    return reject(
      "REFERENCE_INVALID",
      "an Instrument that carries a sunset_condition is created only together with GIP's enrollment receipt for that sunset: a sunset must never be committed without its registration path",
      { key: w.key },
    );
  }
  if (!canonicalEqual(group.rule, GIP_INSTRUMENT_RULE)) {
    return reject(
      "REFERENCE_INVALID",
      "an Instrument is committed under the governing-rule citation of its kind",
      { key: w.key },
    );
  }
  if (w.key !== gipInstrumentKey(instrument.instrument_id)) {
    return reject(
      "REFERENCE_INVALID",
      "an Instrument is at the key derived from its exact instrument_id",
      { key: w.key },
    );
  }
  // the exact joins: the addressed office, and a Scope Binding that belongs to that same office (never a different authority's)
  const office = parseInstrumentSourceAuthorityRef(instrument.source_authority_ref);
  const binding = parseInstrumentScopeBindingRef(instrument.scope_binding_ref);
  if (
    !office ||
    !binding ||
    binding.institution_id !== office.institution_id ||
    binding.office_id !== office.office_id
  ) {
    return reject(
      "REFERENCE_INVALID",
      "an Instrument's scope_binding_ref addresses a Scope Binding of the same authority as its source_authority_ref",
      { key: w.key },
    );
  }
  const officeKey = gipOfficeAuthorityLocusKey(office.institution_id, office.office_id);
  const bindingKey = gipScopeBindingKey(
    binding.institution_id,
    binding.office_id,
    binding.scope_binding_id,
  );
  // its two prerequisites, each pinned by exact key: the committed office, then the committed binding of that office
  const pinnedOffice = requirePrerequisite(group, state, officeKey, "the Office / Authority Locus");
  if (isRejection(pinnedOffice)) return pinnedOffice;
  const pinnedBinding = requirePrerequisite(group, state, bindingKey, "the Scope Binding");
  if (isRejection(pinnedBinding)) return pinnedBinding;
  if (group.reads.length !== 2 || group.depends_on.length !== 2) {
    return reject(
      "REFERENCE_INVALID",
      "an Instrument reads and depends on exactly its committed source office and its committed Scope Binding and nothing else",
      { key: w.key },
    );
  }
  const officeValue = OfficeAuthorityLocusSchema.safeParse(pinnedOffice.fact.value);
  if (
    !officeValue.success ||
    pinnedOffice.fact.owner !== OWNER_GIP ||
    resolveKey(pinnedOffice.fact.key)?.kind.id !== "gip_office_authority_locus" ||
    officeValue.data.institution_id !== office.institution_id ||
    officeValue.data.office_id !== office.office_id
  ) {
    return reject(
      "REFERENCE_INVALID",
      "the Instrument's source authority is a committed GIP Office / Authority Locus with that exact institution_id and office_id",
      { key: officeKey },
    );
  }
  const bindingValue = ScopeBindingSchema.safeParse(pinnedBinding.fact.value);
  if (
    !bindingValue.success ||
    pinnedBinding.fact.owner !== OWNER_GIP ||
    resolveKey(pinnedBinding.fact.key)?.kind.id !== "gip_scope_binding" ||
    bindingValue.data.institution_id !== office.institution_id ||
    bindingValue.data.office_id !== office.office_id ||
    bindingValue.data.scope_binding_id !== binding.scope_binding_id
  ) {
    return reject(
      "REFERENCE_INVALID",
      "the Instrument's scope_binding_ref is a committed GIP Scope Binding of the same office authority, with that exact scope_binding_id",
      { key: bindingKey },
    );
  }
  // the office's own ancestry stays intact: its exact Institution Identity is still committed (not pinned again — the office
  // and its binding carry their own chains)
  const identityKey = gipInstitutionIdentityKey(office.institution_id);
  const identityFact = state.facts.get(identityKey);
  const identity = identityFact
    ? InstitutionIdentitySchema.safeParse(identityFact.value)
    : undefined;
  if (
    !identityFact ||
    identityFact.owner !== OWNER_GIP ||
    !identity?.success ||
    identity.data.institution_id !== office.institution_id
  ) {
    return reject(
      "REFERENCE_INVALID",
      "the Instrument's source office rests on a committed GIP Institution Identity with that exact institution_id",
      { key: identityKey },
    );
  }
  return null;
}

/** The canonical time the committed Temporal state holds, or a rejection when no basis is established. */
function canonicalNow(state: CampaignState, key: string): CanonicalTime | Rejection {
  const fact = state.facts.get(TEMPORAL_STATE_KEY);
  const temporal = fact ? TemporalStateSchema.safeParse(fact.value) : undefined;
  if (!temporal?.success) {
    return reject("PREREQUISITE_MISSING", "no canonical temporal basis is established", { key });
  }
  return temporal.data.canonical_time;
}

/**
 * SUNSET-BEARING INSTRUMENT: the Instrument (every ordinary Instrument rule, via `checkInstrument`) and GIP's enrollment receipt
 * for its sunset, in one create-only group. The Instrument is `active` and its exact `sunset_condition` is an instant in the
 * campaign's canonical unit strictly after the canonical time of the commit; the receipt repeats the Instrument, the sunset and
 * that canonical time; the receipt slot is created, or advanced from a receipt whose Temporal object is already registered, so a
 * previous enrollment can never be abandoned unregistered.
 */
function checkSunsetBearingInstrument(
  group: CommitGroup,
  state: CampaignState,
  instrumentW: Write,
  receiptW: Write,
): Rejection | null {
  const own = checkInstrument(group, state, instrumentW, true);
  if (own) return own;
  const instrument = GovernanceInstrumentSchema.parse(instrumentW.value);
  const sunset = instrument.sunset_condition;
  if (!sunset) {
    return reject(
      "VALUE_INVALID",
      "an enrollment receipt is committed only with an Instrument that carries a sunset_condition",
      { key: receiptW.key },
    );
  }
  if (instrument.lifecycle_status !== "active") {
    return reject(
      "VALUE_INVALID",
      "only an active Instrument earns a sunset: a sunset condition on any other lifecycle is unsupported",
      { key: instrumentW.key },
    );
  }
  const now = canonicalNow(state, instrumentW.key);
  if ("code" in now) return now;
  if (compareTime(now, sunset) !== -1) {
    return reject(
      "REFERENCE_INVALID",
      "a sunset is an exact instant strictly after canonical time, in the campaign's canonical unit",
      { key: instrumentW.key },
    );
  }
  const receipt = SunsetEnrollmentSchema.safeParse(receiptW.value);
  if (
    receiptW.key !== GIP_SUNSET_ENROLLMENT_KEY ||
    !receipt.success ||
    receipt.data.instrument_id !== instrument.instrument_id ||
    !timeEquals(receipt.data.sunset_at, sunset) ||
    !timeEquals(receipt.data.basis_time, now)
  ) {
    return reject(
      "REFERENCE_INVALID",
      "the enrollment receipt repeats exactly the Instrument, its sunset and the canonical time of the commit",
      { key: receiptW.key },
    );
  }
  if (receiptW.basis !== instrumentW.basis || receiptW.secrecy !== instrumentW.secrecy) {
    return reject(
      "VALUE_INVALID",
      "the enrollment receipt carries the authored basis and secrecy of the Instrument it enrolls",
      { key: receiptW.key },
    );
  }
  if (pendingSunsetEnrollment(state.facts)) {
    return reject(
      "REFERENCE_INVALID",
      "a previous sunset enrollment has not been registered with the Temporal kernel: it must be completed before another is made",
      { key: receiptW.key },
    );
  }
  return null;
}

/**
 * SUNSET EXPIRY: GIP's one lifecycle transition, lawful only as its IM-02 stage. From committed state alone: the prior value is
 * `active` and carries a sunset; the new value is exactly `deriveSunsetExpiry` of it; the Temporal object GIP's receipt enrolled
 * still holds that exact boundary; the group reads and depends on exactly the committed source office and Scope Binding (then the
 * durable authority of its open transaction), whose Institution Identity ancestry is still committed; the stage identity and the
 * opened transaction's authority are those of this Instrument's stage, and that transaction engaged this very boundary.
 */
function checkSunsetExpiry(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const bad = (message: string, details?: Record<string, unknown>) =>
    reject("REFERENCE_INVALID", message, { key: w.key, ...details });
  const priorFact = state.facts.get(w.key);
  const current = priorFact ? GovernanceInstrumentSchema.safeParse(priorFact.value) : undefined;
  if (!priorFact || !current?.success || priorFact.owner !== OWNER_GIP) {
    return reject(
      "AMENDMENT_NOT_SUPPORTED",
      "an Instrument is created once and moves only by its sunset expiry: no other validity or lifecycle change, amendment, supersession, repeal or mutation is implemented",
      { key: w.key },
    );
  }
  const instrument = current.data;
  if (w.key !== gipInstrumentKey(instrument.instrument_id)) {
    return bad("an Instrument is at the key derived from its exact instrument_id");
  }
  if (!canonicalEqual(group.rule, GIP_INSTRUMENT_RULE)) {
    return bad("an Instrument moves under the governing-rule citation of its kind");
  }
  const derived = deriveSunsetExpiry(instrument);
  if (!derived.ok) {
    return reject(
      "AMENDMENT_NOT_SUPPORTED",
      "an Instrument moves only from active to expired, and only when it carries a sunset_condition",
      { key: w.key, code: derived.error.code },
    );
  }
  if (!canonicalEqual(w.value, derived.value)) {
    return reject(
      "VALUE_INVALID",
      "an expiry changes lifecycle_status from active to expired and nothing else: every other field, validity_by_order[] included, is unchanged",
      { key: w.key },
    );
  }
  if (w.basis !== priorFact.basis || w.secrecy !== priorFact.secrecy || w.unit !== null) {
    return reject("VALUE_INVALID", "an expiry keeps the basis and secrecy of its Instrument", {
      key: w.key,
    });
  }
  const sunset = instrument.sunset_condition!;
  // the Temporal kernel's object for this Instrument's sunset still holds exactly that earned boundary
  const objectFact = state.facts.get(
    temporalObjectKey(gipSunsetObjectId(instrument.instrument_id)),
  );
  const object = objectFact ? TemporalObjectSchema.safeParse(objectFact.value) : undefined;
  if (
    !object?.success ||
    object.data.next_boundary === null ||
    object.data.next_boundary.boundary_id !== gipSunsetBoundaryId(instrument.instrument_id) ||
    !timeEquals(object.data.next_boundary.at, sunset) ||
    gipObjectViolation(object.data, state, false) !== null
  ) {
    return bad(
      "an expiry runs only for an Instrument whose sunset the Temporal kernel holds as an earned, registered boundary",
    );
  }
  // exactly the two committed GIP sources the Instrument rests on, in declared order, each at its current version
  const keys = instrumentSourceKeys(instrument);
  const officeFact = keys ? state.facts.get(keys.office) : undefined;
  const bindingFact = keys ? state.facts.get(keys.binding) : undefined;
  if (
    !keys ||
    !officeFact ||
    !bindingFact ||
    officeFact.owner !== OWNER_GIP ||
    bindingFact.owner !== OWNER_GIP ||
    !OfficeAuthorityLocusSchema.safeParse(officeFact.value).success ||
    !ScopeBindingSchema.safeParse(bindingFact.value).success
  ) {
    return reject(
      "PREREQUISITE_MISSING",
      "an expiry rests on the committed source office and Scope Binding of its Instrument",
      { key: w.key },
    );
  }
  if (
    group.reads.length !== 2 ||
    group.reads[0]!.key !== keys.office ||
    group.reads[0]!.version !== officeFact.version ||
    group.reads[1]!.key !== keys.binding ||
    group.reads[1]!.version !== bindingFact.version ||
    group.depends_on.length !== 3 ||
    group.depends_on[0] !== officeFact.provenance.group_id ||
    group.depends_on[1] !== bindingFact.provenance.group_id
  ) {
    return bad(
      "an expiry reads exactly its committed source office and Scope Binding, each at its current version, and depends on them and on the durable authority of its transaction",
    );
  }
  const office = parseInstrumentSourceAuthorityRef(instrument.source_authority_ref)!;
  const identityKey = gipInstitutionIdentityKey(office.institution_id);
  const identityFact = state.facts.get(identityKey);
  const identity = identityFact
    ? InstitutionIdentitySchema.safeParse(identityFact.value)
    : undefined;
  if (
    !identityFact ||
    identityFact.owner !== OWNER_GIP ||
    !identity?.success ||
    identity.data.institution_id !== office.institution_id
  ) {
    return bad(
      "the Instrument's source office rests on a committed GIP Institution Identity with that exact institution_id",
      { key: identityKey },
    );
  }
  // the stage identity, and the open transaction's durable authority
  const identityViolation = stageAuthorityViolation(
    group,
    gipSunsetStage(instrument.instrument_id),
    state.facts,
    sunset,
    "ADMISSION",
  );
  if (identityViolation) return bad(identityViolation);
  const authorityFact = state.facts.get(
    temporalTransactionAuthorityKey(group.cause.slice("transaction:".length)),
  );
  const authority = authorityFact
    ? TransactionAuthoritySchema.safeParse(authorityFact.value)
    : undefined;
  if (!authority?.success)
    return bad("an expiry runs under the durable authority of its transaction");
  const reach = sunsetReachViolation(authority.data, instrument.instrument_id, sunset, state.facts);
  if (reach) return bad(reach);
  return null;
}
