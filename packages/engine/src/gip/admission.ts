import {
  InstitutionIdentitySchema,
  OWNER_GIP,
  OfficeAuthorityLocusSchema,
  gipInstitutionIdentityKey,
  gipOfficeAuthorityLocusKey,
  type CommitGroup,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { GIP_OFFICE_RULE, resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";

/**
 * IM-11 admission for the IM-06 GIP owner (IM-03 owner resolution; GIP Draft v2.1 §§2.1, 2.2, 3.1, 3.2; Scaling Profile v1.1
 * §3). Pure: a function of (group, state) only, so it holds for a raw `store.commit` as much as for the owner path.
 * Key-space exclusivity (nobody but `gip`/`gip_institution_identity` can write a `gip/…` key, and the GIP owner can write
 * no canonical, kernel, Population, Production, Economy, World-State, Logistics, Named-Actor, Epistemic or KTI key) is
 * enforced by the owner registry before this runs; this enforces that even the GIP owner can change its state in exactly
 * two lawful ways, each an initial establishment:
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
 *
 * A retry of the same intent is reconciled by the store by identity (RC-16).
 */
export function gipGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
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
  }
  return reject(
    "VALUE_INVALID",
    "GIP state changes only by one Institution Identity establishment or one Office / Authority Locus establishment, each created once",
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
