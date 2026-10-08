// @immortalis/protocol — Host Protocol Gateway (IM-15) and Security / Campaign-Isolation Boundary (IM-16).
// Exactly five allowlisted host operations exist: two read-only ones over the same IM-13 → IM-14 path — the event-addressed
// current active-PC Event-Signal presentation read (thirty-seventh slice) and the trusted-causal delivery of the one Event-Signal
// whose identity trusted server-side code holds (thirty-eighth slice) — and the one trusted, player-confirmed active-PC
// single-leg relocation gateway (forty-first slice) over the existing PC, Logistics and World-State owner paths — and the one
// trusted, separately player-authorized stop-at-delivery temporal advance gateway (forty-third slice) over the existing Temporal kernel — and the one
// trusted, player-authorized NULL-PC OOC target-only temporal advance gateway (forty-fifth slice) over the same kernel and the real
// shipped owner stage providers.
export * from "./causal-event-signal.ts";
export * from "./event-signal.ts";
export * from "./pc-relocation.ts";
export * from "./pc-transfer-advance.ts";
export * from "./null-pc-ooc-advance.ts";
