import { OWNER_DIPLOMACY, type TemporalObject } from "@immortalis/contracts";

/**
 * The registration rule for the Diplomacy side of the temporal declaration. A stable External Recognition or Externalized Claim / Dispute carries forward after
 * its canonical commit (WS-008 v1.1 §24 invariants 19-20: "Stable state carries forward", "No universal diplomacy tick"; §29.7:
 * "no universal diplomacy tick, no automatic relationship refresh, and no global dependency watcher"), so Diplomacy has NO owner
 * operation, stage, declared close, tick, phase, polling loop or standing object in this foundation: an External Recognition is
 * committed by its explicit authored establishment only. `effective_from` is a carried authored value and schedules nothing. Later
 * Diplomacy interfaces declare their own F-017 temporal semantics when they exist; this foundation invents none.
 *
 * Returns a message when a temporal object declares a stage owned by Diplomacy or claims to produce a Diplomacy key — both would
 * be an invented Diplomacy stage or close — and null otherwise. It never restricts what another owner may read.
 */
export function diplomacyObjectViolation(object: TemporalObject): string | null {
  for (const d of object.dependencies) {
    if (
      d.stage.owner_operation.owner === OWNER_DIPLOMACY ||
      d.produces.some((k) => k.startsWith("diplomacy/"))
    ) {
      return "Diplomacy declares no stage, close or operation: an External Recognition or Externalized Claim / Dispute is committed only by its explicit establishment";
    }
  }
  if (object.owning_ref.owner === OWNER_DIPLOMACY) {
    return "Diplomacy owns no temporal object: a stable recognition or claim / dispute carries forward without a Diplomacy tick, phase, scheduler, watcher or standing object";
  }
  return null;
}
