import {
  InstitutionIdentitySchema,
  gipInstitutionIdentityKey,
  type CommitGroup,
} from "@immortalis/contracts";
import { resolveKey } from "../owners/registry.ts";
import { reject, type Rejection } from "../owners/rejection.ts";

/**
 * IM-11 admission for the IM-06 GIP owner (IM-03 owner resolution; GIP Draft v2.1 §§2.1, 2.2, 3.1; Scaling Profile v1.1 §3).
 * Pure: a function of (group, state) only, so it holds for a raw `store.commit` as much as for the owner path. Key-space
 * exclusivity (nobody but `gip`/`gip_institution_identity` can write a `gip/…` key, and the GIP owner can write no canonical,
 * kernel, Population, Production, Economy, World-State, Logistics, Named-Actor, Epistemic or KTI key) is enforced by the
 * owner registry before this runs; this enforces that even the GIP owner can change its state in exactly one lawful way,
 * create-only:
 *
 *  1. INSTITUTION IDENTITY: one identity/provenance record for one continuing institution, at the one key its canonical
 *     `institution_id` derives. It is GIP's own definition: it reads and depends on no foreign fact (a label, a population,
 *     a culture, a charter, a faction, a treaty or a settlement is never a prerequisite, hence never a trigger), and the
 *     group writes nothing else, so establishing an institution creates no office, procedure, instrument, authority,
 *     membership, faction agency, KTI state, awareness or downstream behavior.
 *
 * A second establishment for an occupied identity is refused by the sealed, create-only slot (the committed identity is
 * never rewritten, renamed or replaced); a retry of the same intent is reconciled by the store by identity (RC-16).
 */
export function gipGroupCheck(group: CommitGroup): Rejection | null {
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  if (
    group.writes.length === 1 &&
    group.writes[0]!.expected_version === 0 &&
    kindOf(group.writes[0]!.key) === "gip_institution_identity"
  ) {
    return checkIdentity(group, group.writes[0]!);
  }
  return reject(
    "VALUE_INVALID",
    "GIP state changes only by one Institution Identity establishment, created once",
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
