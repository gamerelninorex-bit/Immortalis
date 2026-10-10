import { randomBytes } from "node:crypto";
import { canonicalJson } from "@immortalis/contracts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * The explicit, bounded confirmation of ONE exact choice, obtained from the operator's console.
 *
 * The service states the exact content of the choice (derived by the caller from current canonical state and the operator's own
 * input), draws a fresh unpredictable challenge, and accepts only the operator typing back, on the very next line, the verb and
 * that challenge exactly. A line typed before the challenge existed, a recorded "yes", free text, an LLM sentence, an empty line
 * or the end of input cannot match: they all decline. The two player choices use different verbs and different fresh challenges,
 * so the confirmation of the relocation is not, and cannot be presented as, the confirmation of the progression.
 *
 * The result is a one-time token that exists only if this function accepted a line: it is bound to the verb and to the exact
 * subject it was shown for, and is consumed by the first use. Nothing a caller (or a test) writes can stand for it, because it
 * is recognised by module-private identity.
 *
 * Not claimed: that a human typed the line. Anything able to write to the operator's console is the operator.
 */

export type ConfirmationVerb =
  | "relocate"
  | "advance"
  | "null-advance"
  | "null-resume"
  | "pc-target-advance"
  | "pc-target-resume"
  | "establish-locality";

export interface OperatorConfirmation {
  readonly verb: ConfirmationVerb;
  readonly subject: string;
}

const live = new WeakSet<object>();

/** The canonical text of what a confirmation is bound to. */
export const subjectOf = (content: unknown): string => canonicalJson(content);

export async function requestOperatorConfirmation(
  terminal: OperatorTerminal,
  verb: ConfirmationVerb,
  subject: string,
  shown: readonly string[],
): Promise<OperatorConfirmation | null> {
  const challenge = randomBytes(6).toString("hex");
  const phrase = `${verb} ${challenge}`;
  for (const line of shown) terminal.say(line);
  terminal.say(`To confirm, type exactly "${phrase}". Anything else declines.`);
  const typed = await terminal.ask(">");
  if (typed === null || typed.trim() !== phrase) return null;
  const token: OperatorConfirmation = Object.freeze({ verb, subject });
  live.add(token);
  return token;
}

/** True exactly once for a token this module issued, for the verb and subject it was issued for. */
export function consumeConfirmation(
  token: OperatorConfirmation,
  verb: ConfirmationVerb,
  subject: string,
): boolean {
  if (!live.has(token) || token.verb !== verb || token.subject !== subject) return false;
  live.delete(token);
  return true;
}
