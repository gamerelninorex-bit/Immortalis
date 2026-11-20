import {
  CAPTURED_CHRONOLOGY_BASIS,
  FACET_TEMPORAL_COORDINATION,
  InitialLocalityCompletionSchema,
  InitialSetupInputSchema,
  OWNER_TEMPORAL_KERNEL,
  TEMPORAL_STATE_KEY,
  TemporalOriginSchema,
  TemporalStateSchema,
  timeEquals,
  type CommitGroup,
  type InitialSetupInput,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { isMsInputRule, isMsCompletionRule } from "../ms-setup/prefix.ts";
import { msTimePins } from "../ms-setup/r1.ts";
import { msPinViolation, msReject } from "../ms-setup/admission.ts";
import { msFenceCheck } from "../ms-setup/fence.ts";
import type { CampaignState } from "../commit/campaign-core.ts";
import {
  chronologyEvidenceViolation,
  inputChronologyRuleViolation,
  scanInitialSetup,
} from "../initial-setup/admission.ts";
import { TEMPORAL_CAPTURED_V2_GENESIS_RULE } from "../initial-setup/rules.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";

const kindOf = (key: string) => resolveKey(key)?.kind.id;

/**
 * clockOriginGenesisViolation(group, state) — the ONE pure pair-shape check of the CAL-TIME T-1 paired genesis (F-014B A0). It is called
 * from BOTH the live `temporalGroupCheck` and the separate `verifyHistorical` Temporal hook: replay runs `verifyHistorical`, not
 * `check`, so a rule placed only in live admission would not run on replay. Writes are found by RESOLVED KIND, never by array position.
 *
 *  - A group with a `temporal_origin` write is lawful only as exactly the pair {temporal/state, temporal/origin}: two writes, both at
 *    expected_version 0, no transaction/authority/object/index write, the Temporal owner and facet on the group and on both writes, the
 *    genesis rule, an initial state (no transaction, no continuation), and the same basis and secrecy on both. Write order is irrelevant.
 *  - A group citing the genesis rule with NO origin write (a lone state, or anything else) is refused: the paired rule never cites a
 *    lone state.
 *
 * It judges SHAPE only; the value and Input/Completion correspondence is `bootstrapInitialTimePrecondition`'s, which runs after it.
 */
export function clockOriginGenesisViolation(
  group: CommitGroup,
  _state: CampaignState,
): Rejection | null {
  const pairShape = (message: string, details: Record<string, unknown> = {}) =>
    reject("VALUE_INVALID", message, { reason: "ORIGIN_PAIR_SHAPE", ...details });
  const genesisRule = canonicalEqual(group.rule, TEMPORAL_CAPTURED_V2_GENESIS_RULE);
  const originWs = group.writes.filter((w) => kindOf(w.key) === "temporal_origin");
  if (originWs.length === 0)
    return genesisRule
      ? pairShape(
          "the paired genesis rule is cited only by the pair of temporal/state and temporal/origin",
        )
      : null;
  const stateWs = group.writes.filter((w) => kindOf(w.key) === "temporal_state");
  if (group.writes.length !== 2 || originWs.length !== 1 || stateWs.length !== 1)
    return pairShape(
      "the origin witness is created only with the initial state, as exactly two writes",
    );
  const originW = originWs[0]!;
  const stateW = stateWs[0]!;
  if (originW.expected_version !== 0 || stateW.expected_version !== 0)
    return pairShape("both writes of the paired genesis are created at expected_version 0");
  if (group.owner !== OWNER_TEMPORAL_KERNEL || group.facet !== FACET_TEMPORAL_COORDINATION)
    return pairShape("the paired genesis is one temporal_kernel/temporal_coordination group");
  for (const w of group.writes)
    if (w.owner !== group.owner || w.facet !== group.facet)
      return pairShape("both writes of the paired genesis carry the group's owner and facet");
  if (!genesisRule)
    return pairShape("the origin witness is created only under the paired genesis rule");
  const state = TemporalStateSchema.safeParse(stateW.value);
  if (!state.success || state.data.last_transaction !== null || state.data.continuation !== null)
    return pairShape(
      "the initial basis of the paired genesis has no transaction and no continuation",
    );
  if (originW.basis !== stateW.basis || originW.secrecy !== stateW.secrecy)
    return pairShape("both writes of the paired genesis carry the same basis and secrecy");
  return null;
}

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
  const originW = group.writes.find((w) => kindOf(w.key) === "temporal_origin");
  // bootstrap-bearing: the actual prefix contains at least one record of the six kinds, regardless of its disposition. A never-bootstrap
  // prefix keeps its one-write opaque genesis and has no witness to attest: an origin there refuses (no late or retroactive attestation).
  if (index.count === 0)
    return originW
      ? reject(
          "VALUE_INVALID",
          "a prefix with no bootstrap record has no authored chronology to attest: it admits no origin witness",
          { reason: "NO_BOOTSTRAP_WITNESS", key: originW.key },
        )
      : null;

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
    // the arm / route / rule correspondence holds for the Completion's own Input here too, whatever admitted it
    const armRule = inputChronologyRuleViolation(
      input.chronology.format_version,
      inputFact.provenance.rule,
    );
    if (armRule)
      return reject("REFERENCE_INVALID", armRule, { reason: "INPUT_ARM_RULE", key: inputFact.key });
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

  // CAL-TIME T-1 §3: the state is found by its resolved kind, never by array position (the paired genesis may list either write first)
  const w = group.writes.find((x) => kindOf(x.key) === "temporal_state");
  if (!w)
    return reject("VALUE_INVALID", "an initial-time group writes the initial temporal state", {
      reason: "NO_STATE_WRITE",
    });
  const s = TemporalStateSchema.parse(w.value);

  // version-to-genesis correspondence, against THIS Completion's own Input: a v2 chronology is the pair or nothing, and a v1
  // chronology (and every direct, never-bootstrap and timed-governance origin) is state-only opaque and never carries a witness
  if (input.chronology.format_version === 2 && !originW)
    return reject(
      "VALUE_INVALID",
      "a version 2 chronology initializes canonical time only through the paired genesis: a lone state refuses",
      { reason: "V2_REQUIRES_PAIRED_GENESIS", key: TEMPORAL_STATE_KEY },
    );
  if (input.chronology.format_version === 1 && originW)
    return reject(
      "VALUE_INVALID",
      "a version 1 chronology yields a state-only opaque genesis: it admits no origin witness",
      { reason: "V1_REFUSES_WITNESS", key: originW.key },
    );

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
  if (originW && input.chronology.format_version === 2) {
    const origin = TemporalOriginSchema.safeParse(originW.value);
    if (!origin.success)
      return reject("VALUE_INVALID", "the origin witness violates its strict contract", {
        reason: "ORIGIN_SCHEMA",
        key: originW.key,
      });
    const o = origin.data;
    const completionFact = state.facts.get(completionKey)!;
    const inputFact = state.facts.get(inputKey)!;
    if (o.campaign_id !== group.campaign_id)
      return reject("VALUE_INVALID", "the origin witness belongs to another campaign", {
        reason: "ORIGIN_CAMPAIGN",
        key: originW.key,
      });
    if (
      !timeEquals(o.origin, s.canonical_time) ||
      !timeEquals(o.origin, input.chronology.document.time)
    )
      return reject(
        "VALUE_INVALID",
        "the origin is the initial canonical time and the governing Input's authored coordinate, in its unit",
        { reason: "ORIGIN_TIME", key: originW.key },
      );
    const c = input.chronology;
    if (
      o.scale !== c.document.scale ||
      o.chronology.capture_format_version !== c.format_version ||
      o.chronology.capture_ref !== c.capture_ref ||
      o.chronology.capture_hash !== c.capture_hash ||
      o.chronology.document_hash !== c.document_hash ||
      o.chronology.grade !== grade
    )
      return reject(
        "VALUE_INVALID",
        "the origin names the governing Input's v2 capture: reference, hashes, grade and declared scale",
        { reason: "ORIGIN_CAPTURE", key: originW.key },
      );
    if (
      !canonicalEqual(o.governing, {
        completion: { fact_key: completionKey, version: completionFact.version },
        input: { fact_key: inputKey, version: inputFact.version },
      })
    )
      return reject(
        "VALUE_INVALID",
        "the origin names the governing Completion and its own Input at their committed versions",
        { reason: "ORIGIN_GOVERNING", key: originW.key },
      );
    if (originW.basis !== expectedBasis)
      return reject(
        "VALUE_INVALID",
        `the origin publication basis for a ${grade} capture is "${expectedBasis}"`,
        { reason: "BASIS_LABEL", basis: originW.basis, key: originW.key },
      );
  }
  if (index.completions.some((c) => isMsCompletionRule(c.provenance.rule))) {
    const fence = msFenceCheck(group, state);
    if (fence) return fence;
    const pins = msTimePins(state);
    if (!pins) return msReject("MS_TIME_SOURCE");
    return msPinViolation(group, state, pins);
  }
  return null;
}
