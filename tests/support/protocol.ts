import { readFileSync } from "node:fs";

/**
 * Predecessor scope assertions used to require an empty protocol placeholder. Since the thirty-seventh and thirty-eighth slices
 * exactly two host operations exist (the event-addressed current active-PC Event-Signal presentation read, and the
 * trusted-causal delivery of the one causally supplied Event-Signal); a predecessor's "no protocol surface was added for this
 * feature" now means the protocol index re-exports those two modules and nothing else.
 */
export const protocolIndexExports = (): string[] =>
  [...readFileSync("packages/protocol/src/index.ts", "utf8").matchAll(/^\s*export\b.*$/gm)].map(
    (m) => m[0].trim(),
  );

export const PROTOCOL_ONLY_EVENT_SIGNAL_READ = [
  'export * from "./causal-event-signal.ts";',
  'export * from "./event-signal.ts";',
];

export const READ_REQUEST = (event_id: string, over: Record<string, unknown> = {}) => ({
  operation: "read_current_event_signal_presentation",
  event_id,
  ...over,
});

export const CAUSAL_REQUEST = (over: Record<string, unknown> = {}) => ({
  operation: "deliver_causal_event_signal_presentation",
  ...over,
});

export const PROTOCOL_REFUSAL = JSON.stringify({
  ok: false,
  error: { code: "PROJECTION_UNAVAILABLE", message: "no projection is available" },
});
