# Confirmed Original Locality & Finite Source Admission Foundation

> **OOC DEVELOPMENT / SCENARIO INSTRUMENTATION.** This is an out-of-character local console path that lets an operator author, confirm and commit the **physical setting substrate** of a new campaign: ONE curated **ORIGINAL** World Profile, ONE locus of that world and ONE genuinely authored **EXACT_FINITE** Source Condition at that locus. It is **mechanism only**. It is not the World Generation adaptive conversation, not a First Playable, not an accepted completed town, not live perception, not autonomous NPC behavior and not in-world player action. It creates no actor, cohort, relationship, character, perception, knowledge, capability or permission to extract anything, and it advances no time.

Bounded implementation slice (`@immortalis/operator`: `establish-locality`, `locality-status`), composed from three **already implemented** same-owner admissions on `CanonicalCampaign`: `establishWorld` → `establishLocus` → `establishSourceCondition`. No engine, contracts, protocol or testkit module changed, and the shipped binary (`packages/operator/src/bin.ts`) is byte-for-byte what it was: it registers no owner extension.

Authority: the BLUE v5 bounded implementation brief "Confirmed Original Locality & Finite Source Admission" (native pin `2026-10-10T11:45:43.936Z`) on official `main` `7fe37737165ce5085c89401cddf421a651441796` (baseline CI run `38045515925`), obligation OB-030 (cross-workstream implementation; overall F-028 stays blocked), under F-027 v1.0 composed with F-027-CD1 (`spec/f027/spec-lock.json`, unchanged) and the frozen WG World Generation & World-State Kernel operational draft v1 (Output Packet, Reference Mode, Ownership Guards, Source/functional-owner handoff) and WS-003 Production & Resources §§4, 4A, 4B. **No source pin, Runtime Contract snapshot, open gate, acceptance row or status changed. PF-6/F-028 remains BLOCKED / NOT ACTIVATED and IA/V rows are unpromoted.** Local success is not provider or recovery acceptance (IA-07 stays BLOCKED).

## What exists

| Piece                    | Where                                    | What it is                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Setup file**           | operator-authored, read by `locality.ts` | One strict JSON document: the ORIGINAL world (exactly the World Profile), the locus (naming its world), and the source (exactly `EstablishSourceConditionInput`). Nothing is inferred, estimated, defaulted or delegated.                       |
| **`establish-locality`** | `operator/src/locality.ts`, `cli.ts`     | Reads the setup, checks it, shows ALL of it for ONE typed confirmation, creates (or resumes) the standard campaign package, commits the missing stages in dependency order, then reopens the package afresh and compares the three facts.       |
| **`locality-status`**    | `operator/src/locality.ts`, `cli.ts`     | Reads a campaign's committed state alone (no setup file) and says `LOCALITY_READY` only when all three facts are committed under one setup identity and the whole campaign verifies; a partially constructed campaign is `LOCALITY_INCOMPLETE`. |

## The setup file

```json
{
  "format": "immortalis-original-locality-setup",
  "format_version": 1,
  "world": { "world_id", "premise", "reference_causal_basis": { "mode": "ORIGINAL", "established_canon" },
             "material_world_law_departures": [], "insertion_supporting_constraints": [] },
  "locus": { "world_id", "locus_id", "designation", "constraints": [] },
  "source": { "source_key", "world_id", "locus_id", "dimension", "material_class",
              "quantity": { "amount", "unit" }, "access_facts": [ { "aspect", "statement" } ], "statement" }
}
```

- The **world** section is exactly `WorldProfileSchema` restricted to the `ORIGINAL` reference mode: every other mode, `Surprise Me` or any delegation selector is unrepresentable and refused. The required arrays (`material_world_law_departures`, `insertion_supporting_constraints`, `constraints`, `access_facts`) must be present; an empty array is the explicit "none" and is never defaulted on the operator's behalf.
- The **source** section is exactly `EstablishSourceConditionInputSchema`: `quantity.amount` is a positive safe integer and `unit` a valid identifier; `access_facts` are unique by aspect. World-State itself derives `depth: "EXACT_FINITE"`, `establishment.kind: "INITIAL_SETTING_FACT"`, `recoverable = quantity`, `delivered = []` and `exhaustion = null`; none of them can be supplied. The quantity is a genuinely authored setting fact, **never** an estimate, random roll, availability verdict, yield or renewal.
- The **locus** names its world; the service derives the fact reference. The identities must agree across sections (a locus of another world, a source of another world or at another locus is refused).
- **Every schema is strict.** There is no field for an owner, facet, role, permission, rule, version, expected version, publication label, group or intent identity, acceptance verdict, "confirmed" flag, derived source field, downstream outcome, extraction permission, actor or character: any of them is refused as an unknown field.
- The file is read once from one open descriptor and must be a regular file (not a link) that **you own** and nobody else can write, of bounded size. What was read is what is shown, confirmed and committed.

## The sequence

1. **Read and check.** The setup file is trusted and strictly valid. The service then proves that the genuine World-State operations admit this exact setup by running the three of them, in order, on a **scratch package that is removed afterwards** (the strict input schemas are not the whole of what the owner path checks — the derived Source Condition, for example, rejects duplicate access aspects — and a refusal after the world or locus had committed would strand a campaign that no setup could complete). Nothing is written to the operator's campaign yet; nothing is asked of the console if the setup is refused.
2. **Decide what the directory holds.** Absent or empty → a new standard package will be created (an existing empty directory must already be the operator's own and closed to others). A complete package → opened under the usual local-operator verification. Anything else (a non-empty directory with no campaign manifest — an interrupted creation or foreign content) is `PACKAGE_UNUSABLE` and is never adopted, completed or cleared.
3. **Confirm, once.** The whole setup is shown (authored text is JSON-quoted, so a control sequence in it cannot rewrite the console), together with what is about to be written and a statement of what this does **not** do. The operator types `establish-locality <fresh challenge>` on the very next line; anything else, a stale or pre-typed line, another verb's phrase or the end of input declines and nothing has been written. A setup already fully committed is verified and reported without asking again.
4. **Create** the standard `CanonicalCampaign` package (canonical owner registry only), then **commit** the missing stages in dependency order — world → locus → source — each its own durable World-State publication, with progress printed after each (`PROGRESS world COMMITTED …`).
5. **Verify on a fresh reopen.** The package is closed and opened again through the engine's owner-verified open (journal replay and canonical integrity); the three facts are read back typed and compared with the confirmed setup — values, owner/facet, key, version-1 provenance (group, intent, cause, basis, secrecy). Only then is `LOCALITY_READY` reported.

Statuses: `LOCALITY_READY`, `LOCALITY_INCOMPLETE` (status only), `LOCALITY_OUTCOME_UNKNOWN`, `LOCALITY_REFUSED`, `LOCALITY_VERIFICATION_FAILED`, `SETUP_CONFLICT`, `PACKAGE_UNUSABLE`, `SESSION_UNAVAILABLE`, `DECLINED`, `INVALID_SETUP`, `SETUP_FILE_UNTRUSTED`, `SETUP_FILE_UNREADABLE`. `LOCALITY_READY` means exactly: these three facts are committed and verify. It is not perception, knowledge, availability or permission.

## Identity, convergence and fail-closed

The service authors only the technical publication identities, and **derives them from the exact confirmed content**: `operator-locality:<id>:{world,locus,source}` (group), `operator-locality-intent:<id>:…` (intent) and one `operator-locality-cause:<id>`, where `<id>` is a hash of the campaign identity and the three authored sections. There is no clock, counter or random value, so:

- **The same confirmed setup always reaches the same identities.** A retry after a crash or a lost reply replays what committed (RC-16, by the store's own identity check) and commits only what did not; the result is the campaign an uninterrupted run produces (equal head, state and journal hashes).
- **A different setup meets the committed identities and is refused (`SETUP_CONFLICT`)**: a different premise, quantity, unit, access fact or designation after the world was committed, a second world identity, a different campaign identity, or a campaign that already holds other canon. The campaign never mixes the world of one choice with the locus or source of another, never holds a second independent canon, and never silently rewrites or backdates a committed fact. If nothing was committed yet, a changed setup is simply a new setup.
- **Partially constructed campaigns are never advertised as ready**: after a world-only or world-and-locus campaign, `locality-status` reports `LOCALITY_INCOMPLETE` and names what is not committed; re-presenting the same setup finishes it.

## Recovery

The package's own file lock and durable-write order are used unchanged. A kill leaves the lock; it is refused (`LOCKED`) until the operator explicitly passes `--reclaim-stale-lock`, which the engine honours only for a provably dead holder. Tests interrupt after the package is created, after the world commit, after the locus commit, after the source commit and before the acknowledgement (real `SIGKILL` of the shipped binary, a lost reply at each of the three owner operations, and a failure before **and** after every mutating filesystem operation of the whole command), and each converges on the uninterrupted campaign. **Residual:** an interruption _inside_ the engine's package creation (before its manifest is written) leaves a directory that is not a loadable campaign; it is reported as `PACKAGE_UNUSABLE` and the operator chooses another directory — nothing inside it is adopted, completed or erased by this command.

## Non-circular cross-owner readiness

The committed source is a real World-State fact, produced by the shipped path in a separate process. The existing Production extraction-basis interface (`SourceDrawdownAdapter.establishBasis`) reads it, pins its exact version, and requires the physical access fact it relies on to be one the source states (`REFERENCE_INVALID` otherwise; `PREREQUISITE_MISSING` for a missing source). This is an interface contrast, **not** an extraction: no request, extraction, source delta, delivery or Reserve inflow is created or asserted, the source stays whole at its authored quantity, and the setup makes no capability, access or permission verdict.

## Not claimed

- The whole World Generation adaptive conversation, a general or autonomous world generator, random source estimation, or any `Surprise Me` delegation.
- Any actor history, cohort, building, ownership, relationship, Player Character, binding, handover or relocation; any perception, `AccessEvent` receipt or player knowledge; any claim the exact amount is publicly known; any extraction, production completion or Reserve credit.
- That exactly one locus and one source are a universal cardinality rule: they are the scope and test sizing of this slice.
- A remote authentication provider, a hosted service or a production authorization: the local operator is the OS user who owns the package and the setup file, as for every other operator command.
- Provider or recovery acceptance (IA-07 stays BLOCKED). **PF-6/F-028 remains BLOCKED / NOT ACTIVATED; IA/V rows are unpromoted; no gate status changed.**
