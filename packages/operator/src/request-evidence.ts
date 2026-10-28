import type { ConfirmationVerb } from "./confirmation.ts";

/** Exact authenticated request evidence. This is never a receipt of human review. */
export interface RequestEvidence {
  readonly origin: "AUTHENTICATED_REQUEST";
  readonly verb: ConfirmationVerb;
  readonly subject: string;
}
const live = new WeakSet<RequestEvidence>();
/** Trusted dispatch adapter only, after capturing or verifying the original exact request. */
export function issueRequestEvidence(verb: ConfirmationVerb, subject: string): RequestEvidence {
  const evidence = Object.freeze({ origin: "AUTHENTICATED_REQUEST" as const, verb, subject });
  live.add(evidence);
  return evidence;
}
export function consumeRequestEvidence(
  e: RequestEvidence,
  verb: ConfirmationVerb,
  subject: string,
): boolean {
  if (
    !live.has(e) ||
    e.origin !== "AUTHENTICATED_REQUEST" ||
    e.verb !== verb ||
    e.subject !== subject
  )
    return false;
  live.delete(e);
  return true;
}
