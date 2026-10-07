import { readFileSync } from "node:fs";

/**
 * Predecessor scope assertions used to require an empty protocol placeholder. Since the thirty-seventh slice exactly one host
 * operation exists (the current active-PC Event-Signal presentation read); a predecessor's "no protocol surface was added for
 * this feature" now means the protocol index re-exports that one module and nothing else.
 */
export const protocolIndexExports = (): string[] =>
  [...readFileSync("packages/protocol/src/index.ts", "utf8").matchAll(/^\s*export\b.*$/gm)].map(
    (m) => m[0].trim(),
  );

export const PROTOCOL_ONLY_EVENT_SIGNAL_READ = ['export * from "./event-signal.ts";'];

export const READ_REQUEST = (event_id: string, over: Record<string, unknown> = {}) => ({
  operation: "read_current_event_signal_presentation",
  event_id,
  ...over,
});

export const PROTOCOL_REFUSAL = JSON.stringify({
  ok: false,
  error: { code: "PROJECTION_UNAVAILABLE", message: "no projection is available" },
});
