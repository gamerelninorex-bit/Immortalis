import { readFileSync } from "node:fs";

/**
 * Predecessor scope assertions used to require an empty protocol placeholder. Since the thirty-seventh, thirty-eighth,
 * forty-first, forty-third, forty-fifth, held-continuation and active-PC target-advance slices exactly seven host operations exist (the event-addressed current active-PC Event-Signal
 * presentation read, the trusted-causal delivery of the one causally supplied Event-Signal, the trusted, player-confirmed active-PC
 * single-leg relocation gateway, and the trusted, separately player-authorized stop-at-delivery temporal advance gateway, and the trusted, player-authorized NULL-PC OOC
 * target-only temporal advance gateway, the trusted, separately player-authorized NULL-PC OOC held-continuation gateway, and the trusted, separately player-authorized active-PC target-only temporal advance gateway); a
 * predecessor's "no protocol surface was added for this feature" now means the protocol index re-exports those modules and
 * nothing else.
 */
export const protocolIndexExports = (): string[] =>
  [...readFileSync("packages/protocol/src/index.ts", "utf8").matchAll(/^\s*export\b.*$/gm)].map(
    (m) => m[0].trim(),
  );

export const PROTOCOL_ONLY_EVENT_SIGNAL_READ = [
  'export * from "./causal-event-signal.ts";',
  'export * from "./current-observation-glance.ts";',
  'export * from "./event-signal.ts";',
  'export * from "./pc-relocation.ts";',
  'export * from "./pc-transfer-advance.ts";',
  'export * from "./null-pc-ooc-advance.ts";',
  'export * from "./null-pc-ooc-held-continuation.ts";',
  'export * from "./active-pc-target-advance.ts";',
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

export const RELOCATION_REQUEST = (over: Record<string, unknown> = {}) => ({
  operation: "commit_confirmed_pc_relocation",
  ...over,
});

export const RELOCATION_REFUSAL = JSON.stringify({
  ok: false,
  error: { code: "RELOCATION_UNAVAILABLE", message: "no relocation is available" },
});

export const GLANCE_REQUEST = (over: Record<string, unknown> = {}) => ({
  operation: "read_current_observation_glance",
  ...over,
});
