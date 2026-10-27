import type { ConfirmationVerb } from "./confirmation.ts";

/** Interface evidence only. A model/serialized object cannot supply this module-private identity. */
export interface ReviewEvidence {
  readonly verb: ConfirmationVerb;
  readonly subject: string;
}
const live = new WeakSet<ReviewEvidence>();
/** TRUSTED HUMAN-REVIEW ADAPTER ONLY, after authenticated exact-subject acceptance or verified original receipt recovery. */
export function issueReviewEvidence(verb: ConfirmationVerb, subject: string): ReviewEvidence {
  const evidence = Object.freeze({ verb, subject });
  live.add(evidence);
  return evidence;
}
export function consumeReviewEvidence(
  evidence: ReviewEvidence,
  verb: ConfirmationVerb,
  subject: string,
): boolean {
  if (!live.has(evidence) || evidence.verb !== verb || evidence.subject !== subject) return false;
  live.delete(evidence);
  return true;
}
export interface ReviewRequest {
  readonly verb: ConfirmationVerb;
  readonly subject: string;
  readonly shown: readonly string[];
  readonly interpretation?: unknown;
  readonly proposal?: unknown;
}
