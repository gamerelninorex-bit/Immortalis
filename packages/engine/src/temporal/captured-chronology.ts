import {
  CAPTURED_CHRONOLOGY_BASIS,
  InitialLocalityCompletionSchema,
  InitialSetupInputSchema,
  fail,
  isFixtureIdentity,
  type Failure,
  type Result,
} from "@immortalis/contracts";
import { sha256Canonical } from "../hash.ts";
import {
  PRODUCTION_INITIAL_SETUP_POLICY,
  scanInitialSetup,
  type InitialSetupPolicy,
} from "../initial-setup/admission.ts";
import type { CampaignStore, CommitOutcome } from "../persistence/store.ts";
import { StageProviderRegistry } from "./providers.ts";
import { TemporalCoordinator, type TemporalErrorCode } from "./coordinator.ts";

export type CapturedChronologyErrorCode = TemporalErrorCode | "CAPTURED_CHRONOLOGY_UNAVAILABLE";

/**
 * initializeCapturedChronology — the trusted `initialize-captured-chronology` writer (companion "Selection and Chronology Checks").
 *
 * It runs AFTER an accepted Completion and BEFORE dependent preparation. It derives the canonical time exclusively from the governing
 * Completion's own Input (never the latest Input) and its record-only chronology capture, and calls the existing Temporal coordinator
 * with the exact versioned reads/dependencies on that Completion and Input. It asks no question and never calls the legacy
 * `initializeTime`; the unchanged KERNEL_RULE structural citation is kept and the state-dependent precondition is additionally
 * enforced by admission and by historical verification.
 *
 * Publication identities derive from SHA256(canonicalJson({campaign_id, completion, input, capture_hash})), so a retry reconciles by
 * identity and a different origin is never reset or overwritten. TOOL_CALL_ONLY captures refuse, and so do fixture methods under the
 * production policy.
 */
export async function initializeCapturedChronology(
  store: CampaignStore,
  options: { readonly policy?: InitialSetupPolicy } = {},
): Promise<Result<CommitOutcome, CapturedChronologyErrorCode>> {
  const policy = options.policy ?? PRODUCTION_INITIAL_SETUP_POLICY;
  const facts = new Map(store.listFacts().map((f) => [f.key, f]));
  const index = scanInitialSetup(facts);
  if (index.completions.length === 0)
    return fail(
      "CAPTURED_CHRONOLOGY_UNAVAILABLE",
      "no qualifying Completion exists: MISSING_STATE, not a guessed zero and not a plain fallback",
    );
  const completionFact = index.completions[0]!;
  const completion = InitialLocalityCompletionSchema.parse(completionFact.value);
  const inputFact = facts.get(completion.input.fact_key);
  if (!inputFact || inputFact.version !== completion.input.version)
    return fail("CAPTURED_CHRONOLOGY_UNAVAILABLE", "the Completion's own Input is not committed");
  const input = InitialSetupInputSchema.parse(inputFact.value);
  const capture = input.chronology;
  if (capture.grade === "TOOL_CALL_ONLY")
    return fail(
      "CAPTURED_CHRONOLOGY_UNAVAILABLE",
      "a TOOL_CALL_ONLY capture is diagnostic only and cannot initialize canonical time",
    );
  const fixture =
    isFixtureIdentity(capture.source.method_id) || isFixtureIdentity(input.author.method_id);
  if (fixture && policy.syntheticEvidence === "REJECT")
    return fail(
      "CAPTURED_CHRONOLOGY_UNAVAILABLE",
      "fixture evidence methods refuse production initialization",
    );
  const digest = sha256Canonical({
    campaign_id: store.head().campaign_id,
    completion: { fact_key: completionFact.key, version: completionFact.version },
    input: { fact_key: inputFact.key, version: inputFact.version },
    capture_hash: capture.capture_hash,
  });
  const coordinator = new TemporalCoordinator(store, new StageProviderRegistry());
  const written = await coordinator.establishCanonicalTime({
    group_id: `captured-chronology:${digest}:group`,
    intent_id: `captured-chronology:${digest}:intent`,
    cause: `captured-chronology:${digest}:cause`,
    basis: CAPTURED_CHRONOLOGY_BASIS[capture.grade],
    secrecy: "engine-internal",
    time: capture.document.time,
    reads: [
      { key: completionFact.key, version: completionFact.version },
      { key: inputFact.key, version: inputFact.version },
    ],
    depends_on: [completionFact.provenance.group_id, inputFact.provenance.group_id],
  });
  if (!written.ok) return written as { ok: false; error: Failure<CapturedChronologyErrorCode> };
  return written;
}
