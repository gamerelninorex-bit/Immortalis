import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { RequestEvidence } from "./request-evidence.ts";
import type { ReviewEvidence, ReviewRequest } from "./review-evidence.ts";

/**
 * The operator's console: the only channel through which a confirmation can enter. `ask` returns the next line the operator
 * typed, or null at the end of input (which is a decline, never a confirmation).
 */
export interface OperatorTerminal {
  /** Trusted exact-request dispatch. Separate from human review and from serialized tool arguments. */
  authorize?(request: ReviewRequest): Promise<RequestEvidence | null>;
  /** Trusted in-process human review; never parsed from CLI arguments or host assertions. */
  review?(request: ReviewRequest): Promise<ReviewEvidence | null>;
  say(text: string): void;
  ask(prompt: string): Promise<string | null>;
  close(): void;
}

/** The real console over a pair of streams (the process's own standard streams by default). */
export function stdioTerminal(
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): OperatorTerminal {
  const rl = createInterface({
    input,
    terminal: Boolean((input as { isTTY?: boolean }).isTTY),
    crlfDelay: Infinity,
  });
  const lines = rl[Symbol.asyncIterator]();
  return {
    say: (text) => {
      output.write(`${text}\n`);
    },
    ask: async (prompt) => {
      output.write(`${prompt} `);
      const next = await lines.next();
      return next.done ? null : next.value;
    },
    close: () => rl.close(),
  };
}
