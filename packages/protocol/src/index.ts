// @immortalis/protocol — Host Protocol Gateway (IM-15) and Security / Campaign-Isolation Boundary (IM-16).
// Exactly two allowlisted, read-only host operations exist, both over the same IM-13 → IM-14 path: the event-addressed
// current active-PC Event-Signal presentation read (thirty-seventh slice) and the trusted-causal delivery of the one
// Event-Signal whose identity trusted server-side code holds (thirty-eighth slice).
export * from "./causal-event-signal.ts";
export * from "./event-signal.ts";
