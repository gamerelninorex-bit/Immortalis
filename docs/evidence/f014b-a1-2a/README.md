# F-014B A1-2a — authenticated configured-GM waiting ingress (mechanism only, non-writing)

Builder evidence for the BLUE v6.2 pinned bounded brief
(<https://app.notion.com/p/42020af901e0819db36cc03a0abc9cdc>, native readback `2026-11-22T00:14:47.019Z`). Work order: issue #123 (lane), #114 (master), protocol
issue #126 v0.2. Base: official `main` `024b109ea7dad5c8428c77d627f36763a3d41829`, no other open PR at the start. This file records evidence; it is not a source,
a verdict or an authorization.

## What exists

| Path                                                          | Role                                                                                                                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/operator/src/gm-wait-exchange.ts`                   | the operator's enrollment of a GM waiting host (digest-only config naming ONE operation and ONE character; owner-only secret), built on the existing crash-safe `bindRequestHost`  |
| `packages/operator/src/gm-wait-ingress.ts`                    | the trusted, non-writing verification: operator → host secret → authorized player view (campaign, keep, binding, active PC) → second enrollment read → strict B0 parse → readiness |
| `packages/operator/src/gm-wait-cli.ts`, `gm-wait-bind-bin.ts` | the operator's bind action (a script; the package manifest is unchanged)                                                                                                           |
| `apps/phone/src/gm-wait-tool.ts`                              | the one connected-client tool `gm_wait_readiness` (`referee` transport scope; read-only; not replayable), re-checking the OAuth grant ledger before and after the ingress          |
| `apps/phone/src/config.ts`, `apps/phone/src/server.ts`        | optional `IMMORTALIS_GM_WAIT_HOST_IDS` (≤ 4, never a referee host id) and the conditional registration beside the existing tools; absent, nothing exists                           |

## Design decisions the brief left to the Builder (named so BLUE can correct them)

1. **Authority is stated by the trusted code, never supplied.** The tool takes the B0 request **without** `context`; the ingress adds the one existing
   `role.gm` / `permission.rule.adjudicate` pair from `GM_ADJUDICATION_AUTHORITY`. A request that names a context, role, permission, campaign, character, host,
   client, grant, session, source, original message or setup input is refused as an over-claim, never overwritten.
2. **The enrollment, not the OAuth scope, is the GM.** `referee` is only the transport lane that offers the tool. The authority is the operator's enrollment of the
   named host for this one operation, proved afresh per call (secret, campaign, kept and bound active PC, writer lock, residue, integrity).
3. **Opaque before authentication, specific after.** Every failure of the proofs is the one `GM_WAIT_UNAVAILABLE`; only a caller already proved the enrolled GM is
   told what is wrong with the request (`NOT_AN_OBJECT`, `TOO_LARGE`, `OVERCLAIM`, `INVALID_B0_REQUEST` with the B0 issues).
4. **The operator package may not import the unexported B0 module** (a standing pin). The phone service hands the UNCHANGED `parseGmWaitRequest` to the ingress,
   which re-checks the authority-bearing parts itself (context pair, trigger literal, phase) so a permissive parser cannot widen the verdict. The trigger literal has
   one local copy (`GM_WAIT_OPERATION`), pinned equal to the B0 constant by `tests/conformance/a1-2a-scope-conformance.test.ts`.
5. **Nothing is qualified that the brief reserves.** The verdict lists `unqualified`: observed basis against the clock, catalogue digest, continuation link,
   transaction identity, Temporal admission and player choice. It derives no `transaction_id`, `cause` or `publication`; the GM supplies them as B0 states.

## Acceptance matrix (all T1 mechanism only; every title carries `[A1-2a] [mechanism only]`)

| Brief item                                                           | Where                                                                                              | Result |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| P01 readiness, INITIAL and CONTINUATION (syntax only), zero bytes    | `gm-wait-ingress.test.ts`, `gm-wait-tool.test.ts` (real OAuth ledger + MCP HTTP)                   | PASS   |
| P02 sparse ordinary wait, one request, no micro-form                 | `gm-wait-ingress.test.ts` (mechanism evidence only; **no** AI GM semantic claim)                   | PASS   |
| P03 same request re-read, new session, no commit                     | both suites                                                                                        | PASS   |
| A01 expired / revoked / unissued grant                               | `gm-wait-tool.test.ts` (transport 401; handler re-check; grant revoked mid-call yields no verdict) | PASS   |
| A02 wrong scope / client / session                                   | `gm-wait-tool.test.ts` (player-scope grant cannot name the tool; another grant's session is 404)   | PASS   |
| A03 referee host without a wait enrollment, wrong secret, other lane | both suites                                                                                        | PASS   |
| A04 forged role / permission / host / campaign / PC                  | `gm-wait-ingress.test.ts` (eight specimens), `gm-wait-tool.test.ts`                                | PASS   |
| A05 stale or replaced operative PC                                   | `gm-wait-ingress.test.ts`                                                                          | PASS   |
| A06 wrong campaign / another operator's binding                      | `gm-wait-ingress.test.ts`                                                                          | PASS   |
| A07 mixed player and GM origin                                       | `gm-wait-ingress.test.ts`                                                                          | PASS   |
| A08 malformed trigger, extra fields, INITIAL/CONTINUATION confusion  | `gm-wait-ingress.test.ts` (fifteen specimens, non-objects, oversize)                               | PASS   |
| A09 GM label with only tool-only setup Input                         | `gm-wait-ingress.test.ts` (no attestation member exists; claims are over-claims)                   | PASS   |
| A10 player decision authored by the GM                               | `gm-wait-ingress.test.ts` (no such member exists)                                                  | PASS   |
| A11 authorization changed between read and handoff                   | enrollment flipped between the two reads; grant revoked in flight                                  | PASS   |
| A12 any write / OPEN / advance                                       | tree-identical before/after; only write-class operation is the package's own writer lock (below)   | PASS   |
| A13 sealed material disclosed                                        | result has a closed key set; no secret, path, keep or provenance                                   | PASS   |
| A14 absent or unknown owner setup / binding                          | bind refuses and writes nothing; a removed keep fails closed                                       | PASS   |
| A15 replay across unrelated sessions                                 | same request digest, different transport reference, nothing retained                               | PASS   |
| A16 legacy routes unaltered                                          | real phone server: every existing tool byte-identical with and without the host list; full suite   | PASS   |

Mutation sanity: seven defences were removed in turn (second enrollment read, over-claim refusal, post-call grant re-check, host list, secret comparison, role
re-check, bound-PC pass); each is killed by a test, except the `boundPcId` hand-off, which is an equivalent mutant because the ingress compares the proved PC to the
enrolled PC again itself.

## Cost (fixture: 11 journal entries; this is not a growth study)

25 consecutive calls: median 27.7 ms, p90 36.1 ms, min 25.0, max 38.1. Per call: `fileSize` 7, `readFile` 6, `readRange` 1, `list` 1, `createExclusive` 2,
`remove` 2 — the last four are the package writer lock (`LOCK` and its claim) taken and released by `CanonicalCampaign.open`, the boundary every read transport
already rests on. One MCP round trip per request. The adapter adds no persistent write, no retained state and no cache of its own. **UNRUN:** cost under controlled
growth of unrelated campaign history (the dominant term is the shared open/verify, not this slice).

## Honest limits (UNRUN or out of scope)

- No genuine AI GM (T2), no named client (T3), no retained-storage restart. The scripted client speaks OAuth 2.1 and MCP and is not a model.
- The connected `IMMORTALIS_T2` plugin exposes no wait tool today; this slice builds the server side. Offering the operation to that host is a deployment step
  (`IMMORTALIS_GM_WAIT_HOST_IDS`) not exercised against it here.
- The OAuth `referee` grant is not pinned to one client or grant per host: any `referee`-scope grant may name an enrolled host id. The authority is the enrollment
  and the per-call proofs. A per-grant pin is an option for BLUE before S4 relies on the identity of the caller.
- The ingress opens the campaign (writer lock) per call, as the player-view and request transports do: a campaign whose single writer is active refuses opaquely.
- `tests/unit/review-projection.test.ts` fails on pristine `024b109` too, in this shallow checkout (`git rev-parse 1ff595a…^{tree}` cannot resolve a historical
  object). It is environmental, not caused by this slice; a full-history CI checkout is the witness.
- S4, B2, R1, H-07, OB-030, F-014B gameplay and release gates are untouched and UNRUN.

## Declared scope-pin transitions

The older "nothing else changed" suites extend their allow-lists from `tests/support/a1-2a-scoped-deltas.ts`. Two are not pure list extensions:
the A1-T08 pin of `tests/integration/phone-bridge.test.ts` is now "the base plus exactly one census line" (`+ "gm-wait-tool.ts",`), and the recorded
`packages/operator/src` tree identity in `tests/support/present-day-identities.ts` was re-recorded as its own comment instructs.
