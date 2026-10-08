# Trusted-Causal Active-PC Event-Signal Delivery Foundation

Thirty-eighth bounded slice, built on the Event-Signal protocol read (`docs/protocol-event-signal-foundation.md`, PR #39) over IM-13 (`docs/i001-event-signal-projection-foundation.md`) and IM-14 (`docs/npk-event-signal-presentation-foundation.md`). **Trusted server-side code that already holds the identity of one current active-PC Event-Signal can bind it into a trusted context; an untrusted host can then invoke one allowlisted, read-only operation that names nothing, and receives only the lawful IM-14 presentation produced by the existing IM-13 → IM-14 path for that event.**

Governing lock: `spec/f027/spec-lock.json`, unchanged. No source pin, snapshot, acceptance-register row or status, open gate or generated spec identity changed. IM-13, IM-14, the PR #39 operation (`protocol/src/event-signal.ts`) and its contract (`contracts/src/protocol.ts`) are byte-identical to their predecessors (asserted by hash). PF-6/F-028 remains BLOCKED / NOT ACTIVATED.

## What exists

| Piece                   | Where                                 | What it is                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Request contract**    | `contracts/src/protocol-causal.ts`    | `DeliverCausalEventSignalPresentationRequestSchema`: strict `{ operation: "deliver_causal_event_signal_presentation" }`. No field for an event, campaign, recipient, role, permission, viewpoint, source or provenance.                            |
| **The operation**       | `protocol/src/causal-event-signal.ts` | `deliverCausalEventSignalPresentation(context, request: unknown)`: validates the strict request, then `deriveEventSignalProjection` (IM-13) and `presentEventSignal` (IM-14) for the context's event. The presenter's value is returned unchanged. |
| **Trusted-side binder** | `protocol/src/causal-event-signal.ts` | `bindTrustedCausalEventSignalContext({ view, recipient_id, event_id })`: for the service, never the host. Returns an opaque frozen handle; its contents live in a module-private `WeakMap`, separate from the PR #39 registry.                     |

## Boundaries

1. **Identity is trusted-side only.** The event, recipient and campaign view come from the binder. The host request has no field for any of them, so none can be supplied, chosen, overridden or probed.
2. **Trusted context is not canon.** IM-13 revalidates the recipient against the canonical active-PC binding and the event against the current packet and transaction formation on every call. A stale, historical, mismatched or inaccessible binding yields the refusal.
3. **One refusal.** Every failure — over-claiming request, forged or wrong-kind context (a PR #39 context is not a causal context), throwing view, absent, stale, inaccessible or non-current event — is the existing IM-13 refusal (`PROJECTION_UNAVAILABLE`), with no cause or validator detail.
4. **No discovery, no multiplicity.** The operation is handed one identity and presents it or refuses. It enumerates, scans, searches and selects nothing, and defines no inbox, queue, batch, order, priority, salience, deduplication or replay.
5. **Causally inert.** Nothing is written, committed, cached, retained, retried, scheduled, drawn or advanced; the context holds a read-only view, never data.
6. **Isolation.** A context bound to one campaign's view cannot reach another campaign even when event and PC identifiers collide. This is bounded evidence for this operation, not an authentication or session isolation claim.

## Not implemented (fail closed, not guessed)

Event discovery or enumeration; inbox, queue, index, cursor or delivery ledger; latest-transaction or store scanning; replay or memory; choosing among multiple events; authentication, credentials, tokens, sessions, accounts or tenants; MCP/HTTP transport; natural-language or RC-15 routing; confirmation/commit surfaces; PC/actor action commitment; Logistics or World mutation; Glance/Focus/Depth; provider, deployment or migration; PF-6/F-028.

## Evidence

`tests/unit/protocol-causal-event-signal.test.ts` (strict one-field request; hostile requests and forged or wrong-kind contexts read nothing; only the bound identity is read), `tests/integration/protocol-causal-event-signal.test.ts` (result equals the existing IM-13 → IM-14 result and the PR #39 operation's; host cannot redirect; stale context fails closed; every rejection is the same refusal; two campaigns with colliding identifiers cannot cross-read; read-only and repeatable), `tests/conformance/protocol-causal-event-signal-conformance.test.ts` (predecessors byte-identical; composes the existing path only; no authority, discovery, write, clock or transport vocabulary; register, lock and gates unchanged). Predecessor tests that asserted the protocol package held exactly the PR #39 operation now assert the two operations. No register evidence was added: whole-row status remains separately governed. Local success is not provider or recovery acceptance.
