import {
  CANON_WRITE_AUTHORITY,
  type CommitGroup,
  type OwnerFactWrite,
  type SourceRef,
} from "@immortalis/contracts";
import type { OwnerRegistry } from "@immortalis/engine";

/**
 * SYNTHETIC TEST DATA. These owners, keys and values are not IMMORTALIS canon and carry no game
 * semantics; they exist only to exercise persistence and commit mechanics. Production code must never
 * import this package to obtain defaults (Bootstrap Plan §2.2).
 */
export const TEST_OWNER = "TEST-OWNER-A";
export const TEST_OTHER_OWNER = "TEST-OWNER-B";
export const TEST_FACET = "test-facet";

export const TEST_OWNERS: OwnerRegistry = new Map([
  [TEST_OWNER, new Set([TEST_FACET])],
  [TEST_OTHER_OWNER, new Set([TEST_FACET])],
]);

export const TEST_RULE: SourceRef = {
  artifact: "test://synthetic-rule",
  native_pin: "test-pin-1",
  clause: "test-clause",
  authority_lineage: ["test-lineage"],
  effective_basis: "test-basis",
  supersedes: null,
};

export function write(
  key: string,
  value: OwnerFactWrite["value"],
  overrides: Partial<OwnerFactWrite> = {},
): OwnerFactWrite {
  return {
    key,
    owner: TEST_OWNER,
    facet: TEST_FACET,
    value,
    unit: null,
    basis: "test-basis",
    secrecy: "test-secrecy",
    expected_version: 0,
    ...overrides,
  };
}

export function group(
  campaignId: string,
  n: number,
  writes: OwnerFactWrite[],
  overrides: Partial<CommitGroup> = {},
): CommitGroup {
  return {
    campaign_id: campaignId,
    group_id: `group-${n}`,
    intent_id: `intent-${n}`,
    owner: TEST_OWNER,
    facet: TEST_FACET,
    cause: `cause-${n}`,
    rule: TEST_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes,
    ...overrides,
  };
}
