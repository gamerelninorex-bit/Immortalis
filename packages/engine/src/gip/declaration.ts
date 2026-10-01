import { OWNER_GIP, type TemporalObject } from "@immortalis/contracts";

/**
 * The registration rule for the GIP side of the temporal declaration. Stable institution identity carries forward after its
 * canonical commit (GIP Draft v2.1 §1 "Stable state carries forward. Passage of time alone does not require a GIP
 * resolution"; Scaling Profile v1.1 §7 "no per-turn politics phase"), so GIP has NO owner operation, stage, declared close,
 * tick, phase, polling loop or standing object in this foundation: an Institution Identity is committed by the explicit
 * authored establishment only. Later GIP interfaces declare their own F-017 temporal semantics when they exist; this
 * foundation invents none.
 *
 * Returns a message when a temporal object declares a stage owned by GIP or claims to produce a GIP key — both would be an
 * invented GIP stage or close — and null otherwise. It never restricts what another owner may read.
 */
export function gipObjectViolation(object: TemporalObject): string | null {
  for (const d of object.dependencies) {
    if (
      d.stage.owner_operation.owner === OWNER_GIP ||
      d.produces.some((k) => k.startsWith("gip/"))
    ) {
      return "GIP declares no stage, close or operation: an Institution Identity is committed only by its explicit establishment";
    }
  }
  if (object.owning_ref.owner === OWNER_GIP) {
    return "GIP owns no temporal object: stable identity carries forward without a GIP tick, phase or standing object";
  }
  return null;
}
