# IMMORTALIS B3 — C0/QV-1 Independent Source-Candidate Failure Report

**Date:** 2026-11-23. **Scope:** the exact original BLUE full-B3 archive, not a newly adopted source. **Disposition:** QV-1 FAIL on both candidates, corrected owner-fact authoring required. **No code, writer activation, PR, merge, or source adoption is asserted.**

## Direct manifest census

The two JSONs were read as original raw ZIP members; the candidate records are `opening_contract.owner_group_publications[]`:

| Profile | Records | `key` or `fact_key` | Native `value` or `writes` | Partial `authored_value` | Producer-only descriptions | QV-1 complete original groups |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `workshop-opening-quiet-v1.json` | 25 | 0 | 0 | 7 | 18 | **0** |
| `workshop-opening-glassbell-v1.json` | 28 | 0 | 0 | 7 | 21 | **0** |

Thus each present `authored_value` is at most an unkeyed candidate value, not a complete original owner publication group. The prior twelve static mutant checks did not attempt the required RED CB-1.3 QV-1 strict owner-value admission check. **Do not promote those checks to QV-1 PASS.**

### Partially authored records (both profiles)

Sequence 1 `world` / World-State world_profile; sequence 2 `workshop_locus` / World-State world_locus; sequence 14 `institution` / GIP institution identity; sequences 15 and 16 `supervisor_office` / `attendant_post` / GIP office authority locus; sequence 17 `local_scope` / GIP scope binding; sequence 20 `production_reserve` / Production Reserve. Their `authored_value` JSON must be parsed against exact own-owner registered schema and supplied with original key, expected version, facet, group dependency and real publication receipt. Passing a shape checker is not owner admission.

### Original producer-only records (both profiles)

| Sequence | Alias | Current value absence / corrective requirement |
| ---: | --- | --- |
| 3 | pc_host | Real source-authorized PC existence, identity and original user decision; no synthetic acceptance |
| 4 | native_compatibility_verdict | Authenticated original referee decision, scoped to exact PC and place |
| 5 | pc_binding | Original Role Registry binding only after PC/native verdict |
| 6 | physical_placement_verdict | Distinct authentic referee decision for placement |
| 7 | pc_placement | World-State custody only after real binding + both referee decisions |
| 8 | supervisor_existence | **DELETE** per RED CB-4: supervisor is opaque GIP `holder_ref`, NOT a second actor |
| 9 | attendant_existence | One M-S original actor, with player-authored or player-delegated single source leaf, not a Profile forge |
| 10 | actor_setup_placement | Original owner placement for the M-S attendant only |
| 11 | actor_setup_closure | Original owner closure for the attendant, correct committed M-S prefix |
| 12 | attendant_presence | Source-qualified real R1 physical presence, not copied from prose |
| 13 | founding_order | **REPLACE** per RED CB-5 with existing Institution Identity's opaque `constitutive_source_ref` when lawful; no automatic new founding-kind grant |
| 18 | charter | RED CB-5: *new disjoint GIP owner kind*, original key/strict schema; requires AD-1 grant for effective use |
| 19 | economy_request | **INSERT Population carrier ledger first** under RED CB-3, then issue native Economy request against its pinned Unit/Cohort |
| 21 | production_start | One atomic 3-write Production group (Reserve update + Claim + Operation), not independent claims |
| 22 | production_temporal_enrolment | Generic Temporal registration, distinct committed group and owner |
| 23 | instruction | RED CB-5 new disjoint GIP instruction kind, not generic Instrument; AD-1 pending |
| 24 | accepted_standing_duty | One Named Actor standing duty from actual prior charter/instruction; no actor-choice fiction |
| 25 | coverage_anchor (quiet) | Health prospective anchor with real source inventory/host history; no inferred clearance |

### Glassbell-only additional records

Sequence 25 `glassbell_exposure`: genuine World-State opening source cause, glassbell only; sequence 26 `auditory_condition`: Health cause-bound ACTIVE hearing limitation derived from admitted exposure; sequence 27 `health_recovery_enrolment`: **generic Temporal registration after original Health condition**, not a fourth Health kind, per CB-8; sequence 28 `coverage_anchor`: Health anchor with full source inventory and original-cut validity.

## Non-negotiable legal distinction for the authoring replacement

RED CB-1.3 requires each group to have a complete original key and strict value before candidate Profile adoption. Some original facts inherently require an authenticated live producer, signed reviewer, original player instruction, or committed predecessor revisions; the old ZIP contains none of those original producer artifacts. **Do not backfill placeholders or counterfeit signatures to pass QV-1.** If a complete value cannot be determined lawfully until a producer runs, report the exact key/producer/prestate and seek the narrowly necessary source decision for the Profile model. Do not silently reinterpret `requirement` as `value` or claim that a later runtime derivation is a byte-immutable pre-authored value.

## RED corrections that change the opening contract itself

- **CB-3:** Native Population ledger → native Economy request → original Production Reserve → atomic Production start → generic Temporal registration. No new QO-only requester.
- **CB-4:** Exactly one original M-S attendant, requiring genuine player-authored/player-delegated origin; supervisor is an opaque office holder reference. No invented two-actor writer.
- **CB-5:** Two new strict, mutually exclusive GIP kinds for charter/instruction, subject AD-1; leave `gip_governance_instrument` frozen. Existing Institution Identity `constitutive_source_ref` is opaque provenance, not an automatic self-grant.
- **CB-7:** Test-only timing variants derive their own test pins, never production allowlist. Recovery time uses `SI_SUBDAY_V1` exact unit conversion.
- **CB-8:** Health condition first, then generic Temporal registration. Missing registration causes Health Close UNKNOWN.
- **CB-1:** Strict 64-hex pins only; old ZIP SHA is transport identity, not adoption.
- **CB-2:** Merged B2 does not yet prove IF-6b. Lane X canaries must run; no owner-witnessed stage bypass.

## Mandatory corrective output from source author

1. Two fresh Profile IDs and byte-exact revised manifests, **each containing original registered owner keys plus strict complete values**, every group tagged to real creator, facet, expected version, source and publication order; no fabricated referee/MS decision.
2. QV-1 report: every group individually matched to a verified registered kind/schema on exact main, or marked as a proposed kind with schema/AD-1 status; no claimed QV-1 pass with missing value.
3. C0 original-authentication and A8 hash receipt; peer independently fetches exact source bytes by immutable branch commit and recomputes SHA-256.
4. Explicit AD-4 source-pin and commissioning directive from Sovereign (not a BLUE simulation); AD-1 and AD-5 remain separately required for their source scopes; conditional AD-2/AD-3 only on actual strict route failure.
5. Only then C1-C7 implementation per corrected BLUE v2.0 plan and one full-B3 draft PR.

**Source-of-truth:** BLUE corrected construction plan https://app.notion.com/p/42120af901e081fdac32e51c3350e5ce pin 2026-11-23T10:14:06.394Z; RED one-pass https://app.notion.com/p/42120af901e0812d8667f78defa14e37 pin 2026-11-23T09:31:44.986Z. This report is technical evidence only, not a new RED review or sovereign ratification.
