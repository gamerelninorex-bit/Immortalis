import {
  CAPTURED_CHRONOLOGY_BASIS,
  InitialLocalityCompletionSchema,
  InitialSetupInputSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  timeEquals,
  type CommitGroup,
  type InitialSetupInput,
} from "@immortalis/contracts";
import { isMsInputRule, isMsCompletionRule } from "../ms-setup/prefix.ts";
import { msTimePins } from "../ms-setup/r1.ts";
import { msPinViolation, msReject } from "../ms-setup/admission.ts";
import { msFenceCheck } from "../ms-setup/fence.ts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { chronologyEvidenceViolation, scanInitialSetup } from "../initial-setup/admission.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";

/**
 * bootstrapInitialTimePrecondition(group, state) — the state-dependent initial-time authority of the v0.9 Initial Locality Bootstrap
 * (companion "Selection and Chronology Checks"). It runs in Temporal's `expected_version === 0` branch BEFORE the existing
 * initial-establishment `return null`, and again from historical verification against each actual incremental pre-state, so a raw
 * `store.commit` or a replayed journal cannot bypass it — including a plain write that cites the unchanged KERNEL_RULE.
 *
 * Not an `alternateRules.admits(value)` implementation and not a discriminator in the clock value: it reads the committed
 * pre-state. `governingRuleLawful` alone is insufficient (its base-rule success reads no state).
 *
 * Campaigns whose prefix is NOT bootstrap-bearing keep their existing initialization semantics (returns null at once).
 */
export function bootstrapInitialTimePrecondition(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  const index = scanInitialSetup(state.facts);
  // bootstrap-bearing: the actual prefix contains at least one record of the six kinds, regardless of its disposition
  if (index.count === 0) return null;

  // this cut admits one world/locus pair per campaign: an out-of-scope pair in the history cannot be ignored by initial time
  const pairs = new Set<string>();
  for (const s of index.sessions.values()) {
    const i = InitialSetupInputSchema.parse(s.input.value);
    pairs.add(`${i.world_id}\u0000${i.locus_id}`);
  }
  for (const c of index.completions) {
    const v = InitialLocalityCompletionSchema.parse(c.value);
    pairs.add(`${v.world_id}\u0000${v.locus_id}`);
  }
  if (pairs.size > 1)
    return reject(
      "REFERENCE_INVALID",
      "the history holds more than one bootstrap world/locus pair: initial time refuses",
      {
        reason: "BOOTSTRAP_PAIR_CUT",
      },
    );

  // at least one qualifying Completion is required; a plain fallback after cancel/park/refusal is never available
  if (index.completions.length === 0)
    return reject(
      "PREREQUISITE_MISSING",
      "a bootstrap-bearing prefix has no qualifying Completion: no captured-time initialization, and no plain KERNEL_RULE fallback",
      { reason: "NO_COMPLETION" },
    );

  // every accepted Completion's chronology must agree; each is resolved through ITS OWN Input, never a latest Input
  let governing: { input: InitialSetupInput; completionKey: string; inputKey: string } | null =
    null;
  let agreed: { hash: string; time: unknown } | null = null;
  for (const c of index.completions) {
    const v = InitialLocalityCompletionSchema.parse(c.value);
    const inputFact = state.facts.get(v.input.fact_key);
    if (!inputFact || inputFact.version !== v.input.version)
      return reject("REFERENCE_INVALID", "a Completion's own Input is not the committed version", {
        reason: "COMPLETION_INPUT",
      });
    const input = InitialSetupInputSchema.parse(inputFact.value);
    if (isMsInputRule(inputFact.provenance.rule) !== isMsCompletionRule(c.provenance.rule))
      return msReject("MS_ROUTE_PAIR");
    const here = { hash: input.chronology.document_hash, time: input.chronology.document.time };
    if (agreed && agreed.hash !== here.hash)
      return reject(
        "REFERENCE_INVALID",
        "accepted Completions disagree on the chronology: ambiguity refuses initialization",
        {
          reason: "CHRONOLOGY_AMBIGUOUS",
        },
      );
    agreed = here;
    governing ??= { input, completionKey: c.key, inputKey: v.input.fact_key };
  }
  const { input, completionKey, inputKey } = governing!;

  const bad = chronologyEvidenceViolation(input.chronology, group.campaign_id);
  if (bad) return reject("VALUE_INVALID", bad.message, { reason: bad.reason });
  const grade = input.chronology.grade;
  if (grade === "TOOL_CALL_ONLY")
    return reject(
      "VALUE_INVALID",
      "a TOOL_CALL_ONLY chronology capture cannot initialize canonical time",
      {
        reason: "CHRONOLOGY_GRADE",
      },
    );

  const w = group.writes[0]!;
  const s = TemporalStateSchema.parse(w.value);
  if (!timeEquals(s.canonical_time, input.chronology.document.time))
    return reject(
      "VALUE_INVALID",
      "the initial canonical time is not the governing Input's captured chronology time (same unit, same value)",
      { reason: "TIME_MISMATCH", key: TEMPORAL_STATE_KEY },
    );
  if (s.last_transaction !== null || s.continuation !== null)
    return reject("VALUE_INVALID", "the initial basis has no transaction and no continuation");

  // exact versioned reads/dependencies on the governing Completion and its Input
  const completion = requirePrerequisite(group, state, completionKey, "the governing Completion");
  if (isRejection(completion)) return completion;
  const inputDep = requirePrerequisite(group, state, inputKey, "the governing Input");
  if (isRejection(inputDep)) return inputDep;

  // grade-specific provenance: original-message evidence is never labelled an operator confirmation
  const expectedBasis = CAPTURED_CHRONOLOGY_BASIS[grade];
  if (w.basis !== expectedBasis)
    return reject(
      "VALUE_INVALID",
      `the initial-time publication basis for a ${grade} capture is "${expectedBasis}"`,
      {
        reason: "BASIS_LABEL",
        basis: w.basis,
      },
    );
  if (index.completions.some((c) => isMsCompletionRule(c.provenance.rule))) {
    const fence = msFenceCheck(group, state);
    if (fence) return fence;
    const pins = msTimePins(state);
    if (!pins) return msReject("MS_TIME_SOURCE");
    return msPinViolation(group, state, pins);
  }
  return null;
}
