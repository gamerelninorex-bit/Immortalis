# ROADBED GM-native first-profile freight bridge

Construction record of the **GM-native, source-qualified first-profile freight operation bridge**, built under the BLUE v6.2 Continuation
Preflight ("ROADBED — BLUE v6.2 Continuation Preflight — GM-Native First Freight Bridge — PASS — 2026-11-17": scoped PASS, bounded Builder brief; base `main`
`49c2892344104ed530b87abf38ee1afee82d4c35`) over the merged first-profile freight Foundation F + Integration I (PR #102/#103, `docs/roadbed-freight-first-profile-foundation.md`), ratified source
architecture **R2-D18 v1.2.1** (Sovereign R2-D22) and the scoped **R3-T2** EL-01F / EL-02S / F-017 overlay as corrected by **R3-T17 CT-1..CT-4**
(R3-T20, re-freeze R3-T21).

Status: **built, staged, unmerged, awaiting independent BLUE review.** Evidence is **mechanism only (T1)**: a script plays the GM; no model,
host application, named client, retained storage or paid host is involved (§8). Every tool name, request field and result label below is a
_technical transport encoding_ of operations whose source semantics already exist; it is not a frozen source literal and it adds no source law (§5).

## 1. What exists

A compatible AI game master, registered as a **stdio MCP server's client**, can: author an original NULL-PC quarry/textile world in ordinary
language; submit the typed reading of each premise it genuinely specified; consult source-qualified owner status; and ask the already-governed
first-profile chain to proceed. Everything the owners derive, commit or refuse is the **existing** owner code (§3); the model is never a
canonical owner.

```
 operator (OS user, owns the package)                       AI host (Claude Code, any MCP-over-stdio client)
   immortalis-gm-freight-bind  ──► binding + owner-only          │  gm_freight_status                (intake / continuation, read)
        (proves NULL-PC campaign)   secret file                  │  gm_freight_establish_setting     (world, two sites, the way between)
                                                                 │  gm_freight_attest_opening        (the WHOLE original envelope, once)
   immortalis-gm-freight  (stdio MCP server)  ◄──────────────────┤  gm_freight_establish_legal       (institution, office, binding, instrument)
        per call, afresh:                                        │  gm_freight_initiate              (proceed as far as the owners allow)
          1. OS user owns package + state dir                    │  gm_freight_report_site_change    (GM-authored PROSPECTIVE change)
          2. host id + its own secret (constant-time)            │  gm_freight_withdraw              (ask Economy / Logistics to withdraw)
          3. strict re-open of the campaign under its lock       │  gm_freight_reconcile             (which acts committed under my token)
          4. bind a trusted session ► runGmFreightOperation
```

| Tool                            | Owner acts it sequences (each a discrete, separately admitted commit)                                                                                                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gm_freight_status`             | none (reads exact keys); returns the milestones reached, the fixed request's owner-derived status and what is awaited and whose it is                                                                                                                                                                |
| `gm_freight_establish_setting`  | World-State: world, origin locus, destination locus, corridor                                                                                                                                                                                                                                        |
| `gm_freight_attest_opening`     | World-State: the Opening Source Attestation (the GM's authorship is stated by the trusted side)                                                                                                                                                                                                      |
| `gm_freight_establish_legal`    | GIP: Opening Basis, institution, office, Scope Binding, Instrument, seven clauses, Legal Readiness Seal                                                                                                                                                                                              |
| `gm_freight_initiate`           | World-State site condition → Production specification and lot → Economy C-05 → Production start → Temporal registration → _(player's time)_ → Economy E0 → Logistics service basis, L0, L1/F3 → Economy E1 → Temporal enrolment → _(player's time)_ → Economy AD; stops at the first refusal or wait |
| `gm_freight_report_site_change` | World-State: one prospective site-condition change under the GM's adjudication authority                                                                                                                                                                                                             |
| `gm_freight_withdraw`           | Economy W2/W3 withdrawal-pending → Logistics F2 unused release (only where a service is committed) → Economy close C                                                                                                                                                                                 |
| `gm_freight_reconcile`          | none (reads derived identities); the acts committed under a retry token, with their revisions                                                                                                                                                                                                        |

## 2. Who owns what: the GM, the engine, the operator, the player

| Concern                                                          | Owner                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary-language setting, typed premises, GM prospective change | **GM** (`role.gm` + `permission.rule.adjudicate`, stated by trusted code into `authored_under`; the request has no field for it)                                                                                                         |
| Every derivation, commit, refusal                                | **Existing owners** through their existing adapters, re-derived by IM-11 admission under the engine's own archivist authority                                                                                                            |
| Starting chronology (Temporal origin)                            | **Operator**, with the existing `initialize-time` command and its typed confirmation. The bridge cannot originate time                                                                                                                   |
| Every advance of canonical time                                  | **Player's own OOC choice**, with the existing `null-advance` command (`role.player` + `permission.player_choice.commit`) through the NULL-PC gateway. The bridge cannot advance or resume time and says what is awaited and whose it is |
| Outcome, status, verdict                                         | **Never the host**: no request field, anywhere, can state one (§5, enforced by the schemas and by `tests/security/gm-freight-security.test.ts`)                                                                                          |

Routine inference stays the GM's (BLUE finding: **GM-native routine inference: CONFORMS**). The GM says "there is a quarry, a lawful works office, a
genuinely existing twelve-block need and an available carriage service; establish and administer that one shipment" and supplies the distinct
real premises it authored; it is never asked for eye/facing/rate/weight micro-queries, routine confirmations, player forms or invented PC consent.
A closed road or no lawful service prevents L0/L1: appealing narration cannot create capacity, move cargo or rewrite the sealed order.

## 3. Ownership: nothing new is an owner

No owner, fact kind, facet, key space, rule, stage, clause, status or lock entry was added or changed (`tests/conformance/gm-freight-conformance.test.ts`
pins `owners/registry.ts`, `owners/admission.ts` and the whole `spec/f027` directory to their base bytes). `packages/engine/src/freight/bridge.ts` is a
**router and sequencer**: it holds no fact, decides no rule and writes no key; it invokes only the closed list of existing adapter operations asserted
by the conformance suite, and the Temporal coordinator only to **register** objects (registration resolves nothing and advances nothing). It lives in
the freight directory only so that no predecessor engine-directory census gains a directory; `freight-profile-conformance` records it as a
non-owner module.

## 4. Trust boundary

- **Authentication, afresh on every call** (`packages/operator/src/gm-freight.ts`): the invoking OS user owns the campaign package (closed to others)
  and the owner-only state directory; the host is one the operator bound to **this** campaign's GM freight lane and holds its own secret (constant
  time, also for an unknown host); the package opens under its single-writer lock and is the bound campaign. EVERY failure is the one byte-identical
  `GM_FREIGHT_UNAVAILABLE` refusal (tested for: unbound host, wrong/empty secret, another host's secret, another lane's secret, another campaign, missing
  or loosened directories).
- **A separate credential.** The binding lives in `gm-freight-<campaign>/` beside, and entirely separate from, the referee, player-view,
  observation-request and time-advance-request bindings. The referee lane's three tools are untouched and gain no owner-writing power (asserted).
- **A host's asserted `role.gm` authenticates nothing.** Authority is bound service-side: the trusted session is an opaque frozen handle in a
  module-private registry (`bindTrustedGmFreightSession`); a fabricated or copied object is refused. Every request schema is strict, so `role`,
  `permission`, `authored_under`, `owner`, `status`, `result`, `verdict`, `success`, `confirmed`, `target` and `time` are over-claims, at the top level and
  nested inside authored premises.
- **NULL-PC only.** The bind action refuses a campaign with a bound character; every mutating tool refuses one (the owners' own NULL-PC guards remain).
- **Hostile text is data.** Authored statements are stored verbatim as setting prose and read as data; tested with instruction-like prose in the world
  premise, the designations and every slice statement (the owners' outcomes and the order of acts are unchanged).
- **No new disclosure.** Reads are exact-key owner-backed GM consultation, labelled `GM_CONSULTATION_ONLY_NOT_PLAYER_FACING`. The bridge writes no PC,
  epistemic, observation or presentation fact (tested), grants no broad privileged read and no concealed fact to any player or character.

## 5. Source-to-schema map (technical lowering; no new source field, enum, facet, owner, stage or meaning)

The literal source-fidelity check was repeated against the repository contracts (the executable lowering of the frozen sources) immediately before
construction: `freight-profile.ts`, `gip.ts`, `gip-instrument.ts`, `gip-scope-binding.ts`, `world-foundation.ts`, `world-corridor.ts`. The host-facing
schemas reproduce them **by reference** (asserted by object identity, not by copy):

| Host-facing element                                                                                                  | Source / existing contract                                                                                                                                                                                       | Difference (transport only)                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legal`, `site_condition`, `material_specification`, `input_lot`, `service_premise` slice premises                   | `LegalPremiseSchema`, `SiteConditionPremiseSchema`, `MaterialSpecificationPremiseSchema`, `InputLotPremiseSchema`, `ServicePremiseSchema`                                                                        | none; one `slice_kind` literal per branch, the existing `OPENING_SLICE_KINDS`                                                                                                                                                                                                                                        |
| envelope `{world_id, envelope_id, origin_locus_id, destination_locus_id, slices[]}`                                  | `AttestOpeningInputSchema`                                                                                                                                                                                       | omits `authored_under` (trusted side states `role.gm`/`permission.rule.adjudicate`, `GmAuthoredUnderSchema`) and `operation_id` (= the host's retry token)                                                                                                                                                           |
| `institution`, `office`, `scope_binding`                                                                             | `InstitutionIdentitySchema`, `OfficeAuthorityLocusSchema` (`holder_ref` XOR `decision_body_ref`), `ScopeBindingSchema` (`exception_refs[]` array, singular `inheritance_rule` / `priority_or_conflict_rule_ref`) | none                                                                                                                                                                                                                                                                                                                 |
| `instrument` `{instrument_id, operative_effect, validity_by_order[], lifecycle_status}`                              | `GovernanceInstrumentSchema` (WS-007 §4.1: seven mandatory fields)                                                                                                                                               | the three references are **derived**: `source_authority_ref = gipOfficeAuthorityLocusKey(office.institution_id, office.office_id)`, `authority_basis_ref = legal slice basis_id`, `scope_binding_ref = gipScopeBindingKey(binding ids)`. The assembled value is parsed by the unchanged `GovernanceInstrumentSchema` |
| `world {world_id, premise, established_canon}`, `origin`/`destination {locus_id, designation}`, `corridor.statement` | `WorldProfileSchema` (mode `ORIGINAL`), `WorldLocusSchema`, `EstablishCorridorInputSchema`                                                                                                                       | `reference_causal_basis.mode` fixed to `ORIGINAL`; departures and constraints are `[]` exactly as the F+I fixtures author them                                                                                                                                                                                       |
| `gm_freight_report_site_change` `{condition_id, change_id, statement, outcome}`                                      | `AdmitSiteConditionChangeInputSchema` (`outcome`: `STANDING` / `CEASED`)                                                                                                                                         | omits `authored_under` (trusted)                                                                                                                                                                                                                                                                                     |
| `world_id`, `operation_id`                                                                                           | selectors / the host's RC-16 retry token                                                                                                                                                                         | not source fields                                                                                                                                                                                                                                                                                                    |

Preserved verbatim, unqualified and uninterpreted: WS-007 `instrument_id`, singular `source_authority_ref`, `authority_basis_ref`, scalar `operative_effect`,
singular `scope_binding_ref`, `validity_by_order[]` with `governing_order_ref` and `validity_status` (valid/invalid/void/contested/unresolved), and
`lifecycle_status`; Scope Binding `scope_binding_id`, `scope_type`, `scope_ref`, `target_condition`; C-01 `authority_grant`, C-02/C-03 `entitlement`,
C-04 `permission`, C-05/C-06/C-07 `administrative_direction`; the source-based term result `applies / does_not_apply / contested / unresolved` (separate
from validity and current force). **Not implemented, as before:** positive F1 terminal refusal and W1; W4 (no source-qualified service-by boundary).
**Literal source-fidelity check: PASS** for this NO-NEW-SUBSTANTIVE-SCHEMA scope (see the executable census above); exact future-HEAD attestation is BLUE's.

## 6. Identity, replay and recovery (RC-16)

Every owner act is published under a deterministic identity `gmf:<operation_id>:<act>` derived from the host's own retry token. The same token and terms
**replay** what committed (the owner returns the ORIGINAL receipt, `disposition: REPLAYED`); the same token with changed terms is the owner's
`INTENT_CONFLICT` (`GM_FREIGHT_INTENT_CONFLICT`) and writes nothing; the same authored content under another token is `ALREADY_PRESENT` (nothing written,
no revision claimed). A commit that may have happened without a reply is `GM_FREIGHT_OUTCOME_UNKNOWN` (never "safely absent"): the host calls
`gm_freight_reconcile` and presents the same request with the same token. The lane **does not refuse on residue** of an interrupted commit (an unadopted
journal tail): unlike the read lanes, re-presenting the same identities is this lane's recovery path, and committed canon is the only thing read or written.
`gm_freight_initiate`/`withdraw` choose their next act from committed owner state (exact keys, no scan), so they are naturally idempotent and continue
from whatever the owners hold, however it was reached.

## 7. Predecessor changes (scoped deltas, for BLUE review)

`tests/support/gm-freight-scoped-deltas.ts` pins each file at base and head; `tests/support/gm-freight-removed-pins.ts` records the eight older byte pins
removed; `tests/conformance/gm-freight-conformance.test.ts` recomputes the bases from the base commit (history-guarded).

| File                                                                               | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/protocol/src/null-pc-ooc-advance.ts`, `null-pc-ooc-held-continuation.ts` | **One import and one registry entry each: `economyFreightReceiptProvider`.** The merged F+I chain registers its fourth (ER) stage provider only in test support, so on the shipped NULL-PC gateway the earned receipt stage stopped `DEPENDENCY_UNRESOLVED / PROVIDER_ABSENT` and the chain could never reach ER/AD from a real path (reproduced by a probe at base `49c2892`). This is wiring of an already-shipped owner provider, not a semantic change; it is **flagged for BLUE's explicit review** (§9) |
| `packages/operator/package.json`                                                   | two bin entries; no dependency                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `packages/contracts/src/index.ts`, `packages/engine/src/index.ts`                  | one export line each                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Older conformance suites updated mechanically (each with a comment): provider-set censuses 15 → 16 for the two NULL-PC gateways, the active-PC gateway's
"same set" assertion made "same set without the freight receipt provider", the operator-module and bin-entry censuses, the operator engine-import
census, the GIP wiring censuses (the bridge derives the Instrument's references with the existing key helpers), the freight directory census, the
historical-pin census (526 → 518 pins; the 40 history pins untouched) and the present-day identity table.

## 8. Evidence labels and limits

| Level                                                                            | Status                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **T1** host transport + owner orchestration + replay/recovery (this PR)          | **PASS (mechanism only)** — see `tests/integration/gm-freight-*.test.ts`, `tests/security/gm-freight-security.test.ts`, `tests/conformance/gm-freight-conformance.test.ts`     |
| Real transport path                                                              | the shipped stdio MCP server binary as a separate OS process, bound by the shipped bind binary, driven over real stdin/stdout (`gm-freight-process.test.ts`) — scripted client |
| **T2** a compatible LLM host authors the world in natural language, non-scripted | **UNRUN** — no genuine model was run; nothing here shows that any model can author these premises                                                                              |
| **T3** named client, retained storage, hosted persistence, First/Full Playable   | **UNRUN / NOT GRANTED**                                                                                                                                                        |

Scripted doubles (the "GM" script, the operator's chronology and the player's advances over a console that only types the printed phrase) are
**MECHANISM ONLY**. No paid provider, API or CI secret is used or assumed. Proactive GM or world capability is **not claimed** (the chain advances only
when the player's own time reaches an owner's declared boundary); the safeguard's initiative evidence is OUT OF SCOPE per the brief, and the genuine
missing-cause refusals are tested at the owners through the bridge (W3 with no cause, E2 with a ceased requirement, no dedicated lot, a tie, a post-seal GIP write).

## 9. For independent BLUE review (judgments the Builder made)

1. **The NULL-PC gateway provider registration** (§7): necessary for any real path to reach ER/AD; additive; flagged rather than hidden.
2. **Time is not the bridge's.** The starting chronology and every advance remain the operator's/player's existing commands. A bridge that originated or
   advanced time would have needed a new authority the sources do not grant. Consequence: a complete chain needs a human at those two points.
3. **Attestation is sealed once, so the typed readings are validated before anything is written** (strict schemas, per slice kind); a premise that does not
   parse never reaches the owner. Cross-slice consistency is judged by the owners at admission, as before, and a sealed envelope cannot be amended.
4. **The Instrument's three references are derived** rather than supplied (§5), so the model cannot point an Instrument at an authority other than the one
   it established. If BLUE prefers them supplied and verified, that is a small change.
5. **Per-call strict re-open** (the pattern of every existing lane) keeps the package lock short so the operator's console is never starved, at a cost
   that grows with unrelated history (§10).
6. **Not added:** a `spec-lock.json` receipt entry. The bridge adds no fact kind, owner, rule or stage; BLUE may direct one if it wants the transport names
   recorded as a technical lowering beside `ROADBED-FREIGHT-FI-LOWERING`.

## 10. Cost (Engineering Acceptance §1A)

See `docs/evidence/gm-freight/` (raw samples, `summary.json`, `recovery-matrix.jsonl`) and the PR's Engineering Acceptance section for the measured
tables. Reproduce: `node --experimental-strip-types tools/gm-freight-benchmark.ts matrix <outDir>` (`FREIGHT_BENCH_SIZES`, `FREIGHT_BENCH_REPS`,
`FREIGHT_BENCH_WORLDS`); it runs the unchanged `tools/freight-benchmark.ts` as the BEFORE and the authenticated tool path as the AFTER, on the same
commit and machine, for 0/100/500/2000 unrelated dormant loci.

## 11. Use

```
immortalis-gm-freight-bind --campaign <dir> --campaign-id <id> --host-id <host> [--operator-dir <dir>]    # the operator, once; prints the secret FILE path
claude mcp add immortalis-gm-freight -- node --experimental-strip-types packages/operator/src/gm-freight-bin.ts \
    --campaign <dir> --campaign-id <id> --operator-dir <dir> --host-id <host> --secret-file <file>        # any MCP-over-stdio client can use the same command
```

The operator states the starting chronology with `immortalis-operator initialize-time` and the player advances time with `immortalis-operator null-advance`
(unchanged commands). The secret is read from the owner-only file, never from an argument, the environment or a log.
