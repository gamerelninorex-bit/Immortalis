# F-027 Runtime Contract v0.2 — implementation snapshot (RC-01 – RC-16) and IM mapping

> **DERIVED IMPLEMENTATION ARTIFACT — NOT DESIGN AUTHORITY.**
>
> 1. **Notion source and pin:** "BLUE/CHAT PF-5 / F-027 RUNTIME CONTRACT & TRANSLATION TRANCHE v0.2 — 2026-09-29", <https://app.notion.com/p/3ea20af901e081b8b958f7f3f39cb96a>, native pin **2026-09-29T00:33:04.009Z** (§3 and §4), and "…FOUNDATION TRANCHE v0.1", <https://app.notion.com/p/3ea20af901e081ce9c5dd3044d388173>, native pin **2026-09-29T00:09:56.571Z** (§5 IM map). Governing package: F-027 Final Work / Coding-Agent Implementation Instructions Package v1.0, <https://app.notion.com/p/3ea20af901e081bc9c55d2c5a49cf639>, native pin **2026-09-29T00:40:44.707Z**.
> 2. **Repository snapshot commit:** recorded in `spec-lock.json` (`snapshot_commit`); the hash of this file is recorded there under `snapshot_files`.
> 3. **Conflict rule:** any conflict between this file and the lawful Notion/F-027 composition is resolved in favor of the Notion/F-027 composition.
> 4. **Local edits may not create semantics.** Any edit to this file requires source reconciliation against the pinned Notion text and is a substantive PR (see `spec-lock.json`).

The identifiers below are implementation contracts, not new fictional state owners. A contract field is mandatory when the owning source makes it material. Serialization may add technical metadata, but may not erase owner, unit, basis, uncertainty, secrecy, source/version or causal identity.

## RC-01 — SourceRef / RuleRef

Minimum material fields: immutable page/artifact identity; exact native pin or immutable version; clause/rule reference; authority lineage; effective basis; supersession relation where applicable.
Guard: edit recency alone never establishes authority. A pin locks identity, not permission.

## RC-02 — OwnerFact

Minimum material fields: stable fact/entity key; authoritative owner/facet; typed value or range; unit; effective/close basis; source/provenance; secrecy/access class; lifecycle/version.
Guard: only the substantive owner writes. Foreign facts are referenced, never copied into a second writable truth.

## RC-03 — TemporalRead

Minimum material fields: source owner/fact; AS-OF-NOW or AS-OF-DECLARED-CLOSE; required named Close Basis for the latter; source version; invalidators.
Guard: NOW-after-close is still NOW for SCC/cycle testing. A CLOSE declaration is a dependency, not a global phase.

## RC-04 — StageKey

Minimum material fields: causal event/process identity; owner operation; prospective result identity.
Guard: requested horizon, source-version churn, retry count and slice repartition are not identity dimensions.

## RC-05 — ResolutionTransaction

Minimum material fields: transaction/cause identity; trigger; opening basis/time; requested target/condition; actual stop/remainder; active role/permission context; engaged refs; rule/source versions; committed groups; unresolved dependent remainder.
Guard: there is no universal turn counter and no obligation to resolve unrelated world state.

## RC-06 — Claim

Minimum material fields: transaction/group; conserved key/capacity/ref; quantity or supported bound; unit; incompatible interval/overlap basis; lawful priority/authority basis if one exists; lifecycle/status; lineage.
Guard: a claim is transient coordination evidence, never fictional ownership or an automatic winner. Unsupported incompatible claims receive no credit.

## RC-07 — StagedDelta / CommitGroup

Minimum material fields: owner/facet; expected source/input versions; before basis; proposed delta; governing rule/method; cause; group dependencies; invariant results; commit identity/status.
Guard: uncommitted staging is never current truth. A valid group publishes atomically at the logical boundary; independent groups remain independent.

## RC-08 — ConsequenceEnvelope

Minimum material fields: causing event/envelope identity; affected entity/scope; exposure/interval basis; typed consequence; authoritative writer; downstream consumer; consumed-at-close reference.
Guard: deduplicate by event/envelope instance, not broad cause class. Population or another lawful consumer consumes the same effect once.

## RC-09 — ComputationRecord

Minimum material fields: transaction/group; mechanic; rule/method versions; retained inputs/refs; precommitted assumptions/bands; opportunity/draw identity where relevant; outputs; assertions/failures; affected refs; secrecy; commit status.
Guard: retain material computation evidence; do not generate a second bureaucracy for trivial safely derived arithmetic.

## RC-10 — TemporalObject

Minimum material fields: owning reference; last resolved basis; behavior/partition declaration; earned material boundary/recurrence if any; dependencies; continuation/reconciliation basis; invalidators; information-latency rule.
Guard: active/future-causal work only. Do not pre-generate recurrence history or create immortal pending objects for failed claims.

## RC-11 — SealedContext / AccessEvent

Minimum material fields: event/packet identity and basis; immutable access mode; authoritative payload/carrier; participant/audience basis; exclusions; receipt/comprehension result when lawfully known; historical evidence reference.
Guard: broadcast is not receipt; receipt is not comprehension; present membership cannot backfill historical access.

## RC-12 — CohortRef / PopulationBasis

Minimum material fields: unit class; criterion owner/ref; scope; one declared basis; count/range custodian; retention; invalidators; overlap declaration.
Guard: Population owns membership/count; criterion owners own criteria. Parent plus child and mixed-basis populations are not additive.

## RC-13 — IRB-01 Binding

Minimum material fields: active PC reference or NULL; lawful initiating choice/transition; effective commit; prior/replacement binding; intrinsic-authority migration refs; writer identity/permission.
Guard: canonical binding is written only by the authorized archivist path. Persona names are not authority keys.

## RC-14 — Projection

Minimum material fields: viewpoint; accessible facts only; allowed uncertainty/source disclosure; intended recipient; presentation payload; source versions/invalidators where cached.
Guard: disposable. Hidden keys, seeds, private facts, internal validator failures and timing channels do not leak through the projection.

## RC-15 — Action / Intent Boundary

Minimum material fields when a player/actor request is material: initiating role/entity; requested act; commitment status; required confirmation/authorization; affected owner interfaces; secrecy basis.
Guard: intent is not commitment; OOC refresh/read does not advance world or time; material irreversible implied action requires the governing confirmation/commitment surface.

## RC-16 — Commit Receipt / Recovery Identity

Minimum material fields: canonical group identity; immutable intent identity; authoritative outcome/receipt; effective source/rule/actor/authority basis; delivery/projection acknowledgements where material.
Guard: timeout or lost reply is UNKNOWN, not automatic failure. Reconcile by identity before retry; committed replay returns the existing result and never rerolls.

# Implementation boundaries IM-01 – IM-17 (Foundation v0.1 §5)

These are implementation responsibility boundaries, not new game subsystems or new owners. Columns: primary responsibility · may read/coordinate · may authoritatively write · key prohibitions/interfaces.

| Boundary                                          | Primary responsibility                                                                                                                                       | May read / coordinate                                                     | May authoritatively write                                                         | Key prohibitions / interfaces                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| IM-01 Specification & Authority Loader            | Load exact active Runtime Contract, rule/source identities, role/permission context and invalidators.                                                        | FP-01 source manifest; current rules; role/permission sources.            | Implementation metadata only; no game-world owner facts.                          | Cannot infer authority from page recency, persona, prompt text or host claims.                                                           |
| IM-02 Temporal / Dependency Coordinator           | Resolve target/remainder, due boundaries, causally engaged set, NOW/CLOSE reads, stage identity, SCC checks and lawful causal groups.                        | F-014B, F-017 and owner-declared dependencies.                            | Temporal/provenance coordination records only where specified.                    | No universal tick, fixed owner phase order, world-fact ownership or horizon/version identity escape.                                     |
| IM-03 Owner Resolver Layer                        | Dispatch state changes to the lawful substantive owner/facet and compute staged owner deltas.                                                                | All declared owner inputs through typed interfaces.                       | Only via the mapped owner's contract/facet.                                       | No generic fallback owner; no copying foreign facts into writable local truth.                                                           |
| IM-04 Population / Cohort Adapter                 | Population units/count, residence/presence/burden, labor/migration close semantics, Cohort basis and PCB/PC interfaces.                                      | WS-001 + WS-015 and declared criterion owners.                            | Population-owned membership/count/commitment surfaces only.                       | No mixed-basis intersection, additive overlap, duplicate person contribution or universal annual scan.                                   |
| IM-05 Resource / Production / Logistics Adapter   | Resource/source condition, timed work, durable completion/acceptance, movement commitment, sole in-transfer locus and receipt.                               | WS-003, WS-010 and linked owner state.                                    | Each source owner only through its contract; no cross-owner shortcut.             | Dispatch ≠ delivery; completion ≠ accepted availability; no free carrier or duplicate physical stock.                                    |
| IM-06 Economy / GIP / Diplomacy Adapter           | Monetary/holding/value/flow, authorization, mandate, external term and performance sequencing.                                                               | WS-004, WS-007, WS-008 and Production when physical transformation is relevant. | Economy monetary state; GIP authority/instruments; Diplomacy commitment-of-record, each separately. | Authorization ≠ supply; term ≠ performance/receipt; no broad ownerless fiscal subsystem.                                                 |
| IM-07 Actor / ACS / Capability Adapter            | Named-actor state, collective agency, capabilities/mastery and identity/binding integration.                                                                 | WS-006, WS-011, WS-016, I-002, IR and lawful world fallback.              | Only source-assigned actor/collective/capability facets.                          | No duplicated agency, forced PC inner life, hidden numeric rank conversion or competence inferred from permission.                       |
| IM-08 Military / Health / Custody Adapter         | Force events, formation/membership, hazard consequences, health condition/process, custody close and downstream envelopes.                                   | WS-009, WS-014, world/identity custody rules and Population consequences. | Military formation state; Health condition/process; custody only through lawful custody owner. | No surrender-implies-custody; no feedback of current injury into its causing force stage; one hazard allocation.                         |
| IM-09 Culture / KTI / Social-Meaning Adapter      | Sparse cultural meanings, non-agentic aggregate social position, KTI development and lawful learning/receipt relationships.                                  | WS-002, WS-005, access events, Population/actor criteria as sources.      | Only respective Culture/KTI owner facets.                                         | No count-to-belief apportionment, norm-to-choice coercion, raw broadcast copied into receipt/learning or synthetic agency.               |
| IM-10 Epistemic / Access Router                   | Create and preserve lawful access-event mode, payload/carrier basis, audience/participant evidence, receipt/comprehension distinctions and historical reconstruction. | F-014D plus owner-provided carriers/context.                              | Access/provenance records where F-014D owns them; never foreign world facts.      | No historical backfill from present membership; broadcast is not receipt; mode immutable after creation.                                 |
| IM-11 Validation / Claim / Commit Service         | Transient claims, conserved-key conflict checks, invariant assertions, source-version/foreign-claim revalidation, atomic logical publication, idempotence and unknown-outcome recovery. | All staged deltas and relevant authoritative versions/claims.             | Commit/coordination metadata and owner-authorized destination writes.             | Lock order cannot become gameplay priority; no partial authoritative group visibility; timeout ≠ automatic retry.                        |
| IM-12 Provenance / Archive / Recovery Service     | Material computation evidence, method/rule versions, opportunity provenance, immutable prior results, restore/replay and cold-history lookup.                | Committed transactions and material evidence.                             | Archive/provenance records only.                                                  | Cold evidence cannot grant fictional knowledge; correction does not mutate sealed original evidence.                                     |
| IM-13 Projection / Player Interface               | Construct authorized I-001 player/host projection, interpret input boundary and confirmation surfaces.                                                       | Lawfully accessible state only.                                           | Disposable projection/intent artifacts; no direct world mutation.                 | Intent ≠ commitment; OOC refresh cannot advance world/time; concealed causes cannot leak through errors/timing.                          |
| IM-14 NPK / Presentation Adapter                  | Faithfully render lawful projection into narrative/cards/messages.                                                                                           | Only the filtered projection and allowed presentation context.            | No canonical world state.                                                         | No private-fact invention, forced plot convergence or narration-originated authority.                                                    |
| IM-15 Host Protocol Gateway                       | Expose narrow authenticated allowlisted operations to an external LLM/client.                                                                                | Only minimum-sufficient filtered context and public protocol schema.      | Requests mutations only through validated internal services.                      | No raw DB/repo/filesystem/shell; host role assertions have no authority.                                                                 |
| IM-16 Security / Campaign-Isolation Boundary      | Authentication, authorization, tenant/campaign isolation, secret handling, privilege checks and exfiltration defenses.                                       | Trusted identity/configuration and requested operation metadata.          | Security/session metadata only.                                                   | No secrets in prompts; no cross-campaign access; gameplay-fidelity non-regression mandatory.                                             |
| IM-17 Persistence Adapter Interface               | Provider-neutral canonical persistence contract for authoritative state, indexes, commit identity and recovery.                                              | Validated internal write/read contracts.                                  | Canonical storage only after lawful provider/version adoption.                    | No provider is adopted by this map. Local cache cannot become a second canon.                                                            |

# Frozen-source to IM translation set (Runtime/Translation v0.2 §4)

The 23 frozen entrypoints remain the complete frozen scope. IM-01, IM-11, IM-12, IM-16 and IM-17 are cross-cutting support wherever engaged. Exact native pins and Notion URLs for each entrypoint are recorded in `spec-lock.json` (`frozen_sources`).

| #   | Entrypoint                                   | Lowers to                                                                | Contracts / notes                                                                                                          |
| --- | -------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | F-014B Temporal Resolution                   | IM-02 (IM-11/12 support)                                                 | RC-03/04/05/10. Never a world-fact owner or fixed global tick scheduler. Temporal §§2–19; F-017 §§3–4.                       |
| 2   | F-014D Epistemic Access                      | IM-10, then IM-13/14 presentation path                                   | RC-11/14. Mode immutable after creation; broadcast is not receipt.                                                         |
| 3   | I-001 Context-Adaptive Player Interface      | IM-13                                                                    | RC-14/15. No world write from projection; intent is not commitment.                                                        |
| 4   | I-002 Player Character Generation            | IM-07                                                                    | RC-02/13. Preserve authored existence, current intrinsic/mastery state and generation provenance.                          |
| 5   | IR Player–World Insertion                    | IM-07 (with IM-11 commit)                                                | RC-13. Binding cannot feed backward to create its own prerequisite.                                                        |
| 6   | NPK Narrative & Performance Kernel           | IM-14 (only after IM-13 projection)                                      | NPK owns no canonical world state.                                                                                         |
| 7   | WG World Generation                          | IM-03 (owner routing); IM-07/08 only where source-owned fallback         | Earth/R-001 is profile-qualified, never universal seed.                                                                    |
| 8   | WS-001 Population / Labor / Migration        | IM-04 (IM-11)                                                            | RC-08/12. No universal annual scan; use declared eligible Close Bases.                                                     |
| 9   | WS-002 KTI                                   | IM-09                                                                    | No person-by-skill table and no raw-broadcast-as-receipt shortcut.                                                         |
| 10  | WS-003 Production & Resources                | IM-05                                                                    | RC-06/07/08/10. Durable availability begins only after lawful custodian acceptance.                                        |
| 11  | WS-004 Economy / Exchange / Demand           | IM-06                                                                    | RC-02/06/07. Economy owns holding/value/flow; no duplicate physical stock.                                                 |
| 12  | WS-005 Culture & Society                     | IM-09                                                                    | No count-to-belief apportionment, motive ownership or synthetic agency.                                                    |
| 13  | WS-006 Named Actors                          | IM-07                                                                    | RC-02. Holder-relative referents and sealed true-entity provenance do not grant permissions.                               |
| 14  | WS-007 Government / Institutions / Politics  | IM-06                                                                    | RC-02/06/07. Authorization is distinct from supply, performance and receipt.                                               |
| 15  | WS-008 Diplomacy                             | IM-06                                                                    | Terms/mandates/commitment-of-record do not pre-write later domain performance.                                             |
| 16  | WS-009 Military / Security                   | IM-08                                                                    | RC-08. Membership, force consequences, health and custody remain separated by their owners.                                |
| 17  | WS-010 Logistics                             | IM-05                                                                    | RC-07/08/10. Dispatch is not receipt; in-transfer locus is singular.                                                       |
| 18  | WS-011 Autonomous Collective State           | IM-07                                                                    | Collective agency does not absorb membership, individual motive or legal identity.                                         |
| 19  | WS-012 Intelligence / Covert Action classification | IM-03 into the actual owner adapters                               | No generic Intelligence/Security state ledger.                                                                             |
| 20  | WS-013 Fiscal / Treasury classification      | IM-06 (GIP authorization / Economy money); IM-05 only for physical minting | No Fiscal owner.                                                                                                           |
| 21  | WS-014 Health — Condition & Process          | IM-08                                                                    | RC-08. Health does not write Population count; current injury cannot feed back into its causing force stage.               |
| 22  | WS-015 Cohort Reference Architecture         | IM-04                                                                    | RC-12. Count once per locus; non-additive overlap and one basis are mandatory.                                             |
| 23  | WS-016 Character Capability Protocol         | IM-07                                                                    | C/B/A/S + EX remain qualitative source semantics; no hidden numeric conversion or duplicate contribution.                  |

Runtime role/permission mapping (OB-016 documentary translation, Runtime/Translation v0.2 §5) is **not** snapshotted here; it remains in the pinned Notion source and is tracked as gate `OB-016` in `open-gates.yaml`. Code that needs it must load it through a separately reviewed snapshot change, never by inference.
