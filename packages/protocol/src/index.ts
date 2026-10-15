// @immortalis/protocol — Host Protocol Gateway (IM-15) and Security / Campaign-Isolation Boundary (IM-16).
// The allowlisted host operations are: two read-only ones over the same IM-13 → IM-14 path — the event-addressed
// current active-PC Event-Signal presentation read (thirty-seventh slice) and the trusted-causal delivery of the one Event-Signal
// whose identity trusted server-side code holds (thirty-eighth slice) — and the one trusted, player-confirmed active-PC
// single-leg relocation gateway (forty-first slice) over the existing PC, Logistics and World-State owner paths — and the one
// trusted, separately player-authorized stop-at-delivery temporal advance gateway (forty-third slice) over the existing Temporal kernel — and the one
// trusted, player-authorized NULL-PC OOC target-only temporal advance gateway (forty-fifth slice) over the same kernel and the real
// shipped owner stage providers — and the one trusted, separately player-authorized NULL-PC OOC held-continuation temporal advance
// gateway (held-continuation slice) that resumes exactly such a gateway's committed DEPENDENCY_UNRESOLVED remainder — and the one
// trusted, separately player-authorized ACTIVE-PC target-only temporal advance gateway (stationary PC; initial and held-remainder
// branches under two trusted-side binders) over the same kernel and shipped owner stage providers — and the one trusted, read-only CURRENT
// OBSERVATION GLANCE read (no event identity from the caller) over the same IM-13 → IM-14 path and the Epistemic owner's observation-earned event.
export * from "./causal-event-signal.ts";
export * from "./current-observation-glance.ts";
export * from "./event-signal.ts";
export * from "./pc-relocation.ts";
export * from "./pc-transfer-advance.ts";
export * from "./null-pc-ooc-advance.ts";
export * from "./null-pc-ooc-held-continuation.ts";
export * from "./active-pc-target-advance.ts";
