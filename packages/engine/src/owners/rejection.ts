import type { CommitGroup, Failure, OwnerFact } from "@immortalis/contracts";
import type { CampaignState, CommitErrorCode } from "../commit/campaign-core.ts";

export type Rejection = Failure<CommitErrorCode>;
export const reject = (
  code: CommitErrorCode,
  message: string,
  details?: Record<string, unknown>,
): Rejection => (details === undefined ? { code, message } : { code, message, details });

/**
 * What a group must pin about a foreign fact it references (RC-07 expected source/input versions,
 * group dependencies): a `reads` entry at the fact's current version and a `depends_on` entry for
 * the group that committed it. Returns a rejection or null.
 */
export function requirePrerequisite(
  group: CommitGroup,
  state: CampaignState,
  key: string,
  what: string,
): { fact: OwnerFact } | Rejection {
  const fact = state.facts.get(key);
  if (!fact) {
    return reject(
      "PREREQUISITE_MISSING",
      `${what} is not committed; a dependent write may not precede or create its prerequisite`,
      { key },
    );
  }
  if (!group.reads.some((r) => r.key === key && r.version === fact.version)) {
    return reject("REFERENCE_INVALID", `the group must read ${what} at its current version`, {
      key,
      version: fact.version,
    });
  }
  if (!group.depends_on.includes(fact.provenance.group_id)) {
    return reject(
      "REFERENCE_INVALID",
      `the group must depend on the group that committed ${what}`,
      {
        key,
        group_id: fact.provenance.group_id,
      },
    );
  }
  return { fact };
}

export const isRejection = (r: { fact: OwnerFact } | Rejection): r is Rejection => "code" in r;
