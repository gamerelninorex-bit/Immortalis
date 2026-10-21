# Additional Pre-Play Finite Source Admission Foundation

> **OOC DEVELOPMENT / SCENARIO INSTRUMENTATION.** This is an out-of-character local console path that lets an operator author, confirm and commit **ONE additional EXACT_FINITE Source Condition** at the world and locus of an ORIGINAL locality that `establish-locality` already committed, **before any player character is bound**. It is **mechanism only**: a physical setting fact. It is not source discovery, not perception, not knowledge, not extraction, not collection, not an availability verdict and not autonomous NPC behaviour. It creates no actor, cohort, relationship or character, grants no permission to extract anything, and advances no time.

Bounded implementation slice (`@immortalis/operator`: `establish-additional-source`), composed from the **already implemented** World-State owner operation `CanonicalCampaign.establishSourceCondition`. No `packages/contracts`, `packages/engine`, `packages/protocol` or `packages/testkit` module changed; there is no new World-State operation, owner, facet, schema, source key class, persistent receipt format, status gate or universal multiple-source initializer. The shipped binary registers no owner extension.

Authority: the BLUE v5.2-A1 bounded implementation brief "Additional Pre-Play Finite Source Admission" (native pin `2026-10-21T18:33:04.910Z`) on official `main` `c739ec3834376dc42f7d83c827904f7d94c91911`, under F-027 v1.0 (`spec/f027/spec-lock.json`, blob `43e4325789488e155c60f2deae5028e44286d795`, unchanged) and the frozen WG / WS-003 §§4, 4A, 4B authority that `establish-locality` already uses. **No source pin, Runtime Contract snapshot, open gate, acceptance row or status changed. F-028/OB-030 stays Blocked, PF-6 inactive, IA/V unpromoted.** Local success is not provider or recovery acceptance.

## The command

```
immortalis-operator establish-additional-source --campaign <dir> --campaign-id <id> --source-file <file> [--operator-dir <dir>] [--reclaim-stale-lock]
```

The source file is **exactly one `EstablishSourceConditionInput`** (`packages/contracts/src/source-drawdown.ts`, unchanged): `{ source_key, world_id, locus_id, dimension, material_class, quantity: { amount, unit }, access_facts: [ { aspect, statement } ], statement }`, strict, every field required. It is the same shape as the `source` section of the `establish-locality` setup file and is read the same way: once, from one open descriptor, a regular file (not a link) owned by the invoking OS user and writable by nobody else, of bounded size. What was read is what is shown, confirmed and committed; a file changed afterwards cannot change it.

The file can carry no owner, facet, version, depth, recoverable, delivered, establishment, exhaustion, publication label or "confirmed" claim (any of them is an unknown field and is refused). `quantity.amount` is a positive safe integer; a zero, negative, fractional, string, ranged or estimated quantity has no representation.

**Operator eligibility, not a source-validity rule.** This path additionally requires at least one authored physical access fact, so that the source can later be the target of the existing source-qualified observation (`observe-surroundings --source`), which uses only `source.access.N` premises. That is this command's own condition; the Source Condition schema is unchanged and `establish-locality` still admits a source with no access facts.

## Sequence

1. **Read and check the file** (above). Nothing is asked of the console if it is refused.
2. **Open the existing package** for the local operator (the usual OS-user verification, the package lock, journal replay and canonical integrity). This command **never creates, adopts, repairs or clears** a package: a missing or foreign directory, or another campaign identity, is `SESSION_UNAVAILABLE`.
3. **Read the established locality from canon** (`establishedLocality`, read-only): the ORIGINAL world, the locus and the first source that one `establish-locality` setup identity committed, each still the version-1 fact that setup wrote. None held → `LOCALITY_NOT_ESTABLISHED`; held but since advanced → `PRE_PLAY_CLOSED`.
4. **If this identity already committed** (a repeat, a lost reply, a restart): judge it on the immutable committed record. The same source is verified and reported **without asking again and without a write**; a different content under the same identity is `SOURCE_CONFLICT`.
5. **Pre-play and consistency refusals**, all before the console is asked and with no write: a bound player character (`role.player_character` binding present) → `PRE_PLAY_CLOSED`; a source for another world or locus → `SOURCE_NOT_AT_LOCALITY`; the key already held (including the first source's) or a different additional source already held → `SOURCE_CONFLICT`.
6. **Prove the owner path admits it**: the committed world and locus are republished on a scratch package that is then removed, and the source is run through the genuine `establishSourceCondition` (the owner also rejects, for example, duplicate access aspects). A refusal is `INVALID_SOURCE` with nothing written. The scratch package is never reused.
7. **Confirm, once.** The whole source is shown (authored text JSON-quoted so a control sequence cannot rewrite the console) with what it does **not** do. The operator types `establish-additional-source <fresh challenge>` on the very next line; anything else, a stale or pre-typed line, another verb's phrase or end of input declines and nothing has been written. The confirmation is a one-time token bound to the verb and the exact subject (campaign, locality identity, source identity and the full source).
8. **Commit** the one new key through `CanonicalCampaign.establishSourceCondition` (`PROGRESS source COMMITTED …`). The owner derives `depth: EXACT_FINITE`, `establishment.kind: INITIAL_SETTING_FACT`, `recoverable = quantity`, `delivered: []`, `exhaustion: null`, the locality references, and reads and depends on the world and locus facts. The operator never writes the fact directly.
9. **Verify on a fresh reopen.** The package is closed and reopened through the engine's owner-verified open; the new fact's key, owner/facet, version 1, typed value and committed provenance are compared with the confirmed source, and **every fact the campaign held before is compared with its pre-commit self** (key, owner, facet, value, version, provenance) with the fact count exactly one greater. Only then is `ADDITIONAL_SOURCE_READY` reported.

Statuses: `ADDITIONAL_SOURCE_READY`, `ADDITIONAL_SOURCE_OUTCOME_UNKNOWN`, `ADDITIONAL_SOURCE_REFUSED`, `ADDITIONAL_SOURCE_VERIFICATION_FAILED`, `LOCALITY_NOT_ESTABLISHED`, `PRE_PLAY_CLOSED`, `SOURCE_NOT_AT_LOCALITY`, `SOURCE_CONFLICT`, `SESSION_UNAVAILABLE`, `DECLINED`, `INVALID_SOURCE`, `SOURCE_FILE_UNTRUSTED`, `SOURCE_FILE_UNREADABLE`. `ADDITIONAL_SOURCE_READY` means exactly: this source fact is committed under this identity, verifies, and nothing earlier changed. It is not perception, knowledge, availability or permission.

## Identity, convergence and fail-closed

The service authors only the technical publication identities and derives them from where the source is, never from a clock or a random value: `<id>` is a hash of the campaign identity, the world, the locus and the source key, giving group `operator-additional-source:<id>`, intent `operator-additional-source-intent:<id>` and cause `operator-additional-source-cause:<id>`.

- **The same confirmed source always reaches the same identity.** A retry after a crash or a lost reply replays what committed (RC-16, by the store's own identity check) and never writes a second or altered source.
- **A different source under the same key meets the committed identity and is refused (`SOURCE_CONFLICT`)**; committed facts are never replaced.
- **No retained state is added.** There is no new pin, receipt or ledger format: the committed record in the package is the only memory of what committed. An uncertain outcome is therefore resolved only by reopening and reading canon: the fact is held under the identity (verified without asking again) or it is not (nothing was written, and the same command can be confirmed afresh). An uncertain commit is never followed by a different additional source on the assumption that it did not land: once one additional source is held, a different one is refused.
- **One additional source per campaign is this slice's size, not a cardinality rule**; it is how the command keeps clear of a "universal multiple-source initializer".

## Recovery

The package's own file lock and durable-write order are used unchanged. A kill leaves the lock; it is refused until the operator explicitly passes `--reclaim-stale-lock`, which the engine honours only for a provably dead holder. Tests interrupt by a lost reply after the owner commit, a commit that never reached the store, a failed reopen after the close, a real `SIGKILL` of the shipped binary at the console and after the commit, and a failure before **and** after every mutating filesystem operation of the whole command; each converges on the uninterrupted campaign (equal head, state and journal hashes).

## Security

The full source (quantity, material class, key, access facts and statement) is shown only on the operator's own console and held only in the owner-verified package. It is not written to the retained-state directory, and no host-facing surface (referee, player-view, observe-request or advance-request MCP servers) imports or names this command. **No MCP, phone or client source-list, search or creation tool is added**, and the fixed-shape withholding of the existing source-qualified observation is untouched. The module has no network, child-process, environment or global-state access.

## Downstream boundary

Nothing here makes a host discover sources or permits collection. The existing `observe-surroundings --source <key>` can independently name the new fact, using only its `source.access.N` premises, at an unoccupied canonical observation instant for an original co-located active PC; one event exists per character per instant, so **two sources cannot be observed at one instant**. Any downstream observation with a scripted host is level-1 mechanism evidence, not genuine AI-host semantics or normal-client gameplay. No test in this slice asserts a perception, availability, extraction or collection verdict.

## Mechanical pin adjustments

Seven predecessor conformance tests pin the bytes of the operator files this command must touch to exist at all (`cli.ts`: the new command; `confirmation.ts`: its own confirmation verb, so its confirmation cannot be presented as the locality's; `index.ts`: three named exports), the operator package's module inventory and its exported surface. Their hashes, inventories and lists were adjusted openly, as the previous slice did, and nothing else in those tests changed.

Two predecessor security scans were taught about the new module: the scan that names the operator modules mentioning a source key now lists `additional-source.ts` (it is a trusted-side module that establishes a source, like `locality.ts`), and the scan for canon-writing calls exempts it as it exempts `locality.ts`, because its scratch dry run republishes the committed world and locus on a throwaway package. It is bound instead by `tests/security/additional-source-security.test.ts`, which requires that, outside that dry run, the module's only write is the existing `establishSourceCondition`.

`locality.ts`, the confirmation semantics, `commands.ts`, the contracts, the engine owner API, the spec lock, gates and register remain byte-identical to `main` (pinned in `tests/conformance/additional-source-conformance.test.ts`).

## Not claimed

- A general or autonomous source generator, random source estimation, source enumeration, or any delegation.
- That one additional source is a cardinality rule, or that a second locus or a second world is supported.
- Any actor history, cohort, building, ownership, relationship, Player Character, binding, handover or relocation; any perception, `AccessEvent` receipt or player knowledge; any claim the exact amount is publicly known; any extraction, production completion or Reserve credit.
- Admission into a campaign that has a bound player character, including the saved campaign `campaign-r5-phone` (this slice concerns fresh, disposable pre-play scenario packages only).
- A remote authentication provider, a hosted service or a production authorization: the local operator is the OS user who owns the package and the source file.
- Provider or recovery acceptance. **F-028/OB-030 remains Blocked, PF-6 inactive, IA/V unpromoted; no gate status changed.**
