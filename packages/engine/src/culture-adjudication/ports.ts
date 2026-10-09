import {
  CjaConstituencyRefSchema,
  fail,
  ok,
  type CjaConstituencyRef,
  type Result,
} from "@immortalis/contracts";
import { cjaConstituencyViolation } from "./derive.ts";

/**
 * CJA1 §9.1 — the two narrow typed verification PORTS. Neither is implemented by a live Culture or Population owner in
 * this prerequisite: the adapter consumes PORT A, and PORT B is the boundary the future real Culture context producer uses
 * AT SEAL. Both are asked, never assumed: a port's answer is a claim the adapter verifies against committed state.
 */

/** PORT A's answer for one culture_update_id: a sealed-context attestation (validated by the adapter) or ABSENT. */
export type CultureContextLookup =
  { readonly status: "ATTESTED"; readonly attestation: unknown } | { readonly status: "ABSENT" };

/**
 * PORT A — CultureAdjudicationContextPort. Given ONE culture_update_id, returns one sealed-context attestation or ABSENT. It
 * attests that the sealing and reference provenance were lawful; it does NOT claim the evidence establishes any cultural
 * outcome. The real implementation is supplied only by the later Culture recovery; the prerequisite's tests use an expressly
 * TEST-OWNED stand-in.
 */
export interface CultureAdjudicationContextPort {
  attest(cultureUpdateId: string): CultureContextLookup;
}

/** PORT B's answer: the Population adapter vouches for the engaged membership scope at the named close, or states why not. */
export type ScopeCloseVerdict =
  | { readonly lawful: true; readonly constituency: unknown }
  | {
      readonly lawful: false;
      readonly reason:
        | "RECONCILIATION_DUE_NOT_COMPLETED"
        | "COHORT_NOT_AT_NAMED_CLOSE"
        | "COHORT_REFERENCE_INVALID";
    };

/**
 * PORT B — PopulationCloseScopeVerifier. Used AT CONTEXT SEAL (never at the Culture close) by the future real Culture context
 * producer to attest the PC-CUL/PCB-01 scope-close condition of CJA1 §5.1 — (a) the Cohort is a committed fact stamped at
 * exactly the named Population close, (b) no reconciliation is DUE for the engaged scope, or a due one has completed and its
 * freshly stamped close is the basis, (c) the reference is CURRENT-ONLY at seal — using Population adapter authority.
 * Neither CJA1 nor the adjudicator may self-certify it. In this prerequisite its result can only come from an expressly
 * test-owned setup, and no live Population admission is claimed.
 */
export interface PopulationCloseScopeVerifier {
  verifyScopeClose(cohortFactKey: string): ScopeCloseVerdict;
}

/**
 * The only way a PORT B verdict becomes a retained constituency reference: a lawful verdict whose constituency is a
 * well-formed Cohort reference at the named Population close, recorded with `live_population_admission = false`. A due but
 * incomplete reconciliation, a stale close or an invalid reference is a stop, never a pinned stale close and never a
 * forged one.
 */
export function constituencyFromVerdict(
  verdict: ScopeCloseVerdict,
): Result<CjaConstituencyRef, "CONSTITUENCY_INVALID"> {
  if (!verdict.lawful) {
    return fail(
      "CONSTITUENCY_INVALID",
      `the Population scope close is not vouched: ${verdict.reason}`,
    );
  }
  const parsed = CjaConstituencyRefSchema.safeParse(verdict.constituency);
  if (!parsed.success) {
    return fail("CONSTITUENCY_INVALID", "the vouched constituency violates its contract");
  }
  const violation = cjaConstituencyViolation(parsed.data);
  return violation ? fail("CONSTITUENCY_INVALID", violation.message) : ok(parsed.data);
}
