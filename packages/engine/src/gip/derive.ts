import { fail, ok, type GovernanceInstrument, type Result } from "@immortalis/contracts";

/**
 * The single statement of GIP's one lifecycle transition (WS-007 §4.1 `lifecycle_status`, §4.3 `sunset_condition`, §21.2): an
 * `active` Instrument that carries a `sunset_condition` becomes `expired` and nothing else changes - not `operative_effect`, not
 * `validity_by_order[]` (validity is order-relative and independent of lifecycle, Amendment A7), not the source authority, Scope
 * Binding, authority basis, predecessor reference or the sunset term itself. Pure and deterministic. Used by the owner's stage
 * provider, by admission and by load verification, so the three cannot drift. It reads no clock and no other fact: that the
 * instant has been reached is the Temporal kernel's engagement of the boundary, never a flag or a derived `due`.
 */
export type SunsetExpiryErrorCode = "SUNSET_TERM_ABSENT" | "LIFECYCLE_NOT_ACTIVE";

export function deriveSunsetExpiry(
  current: GovernanceInstrument,
): Result<GovernanceInstrument, SunsetExpiryErrorCode> {
  if (current.sunset_condition === undefined) {
    return fail("SUNSET_TERM_ABSENT", "only an Instrument that carries a sunset_condition expires");
  }
  if (current.lifecycle_status !== "active") {
    return fail(
      "LIFECYCLE_NOT_ACTIVE",
      "only an active Instrument expires: a different, absent or already terminal lifecycle is never reinterpreted",
      { lifecycle_status: current.lifecycle_status },
    );
  }
  return ok({ ...current, lifecycle_status: "expired" });
}
