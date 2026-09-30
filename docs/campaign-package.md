# Campaign package (prototype structured-file persistence)

Implements the provider-neutral IM-17 contract (`packages/engine/src/persistence/store.ts`) with a local, free, deterministic file package, per the Runtime, Save & Implementation Roadmap ("structured-file playable prototype"). **This is not a provider adoption.** It claims no restart/failover/PITR/backup/archive-restore acceptance: IA-07 and CAL-09 remain `BLOCKED`/`UNRUN`.

Governing lock: `spec/f027/spec-lock.json`. Contracts used: RC-01 SourceRef, RC-02 OwnerFact, RC-07 CommitGroup (input side), RC-16 receipt/recovery identity. Boundary: IM-17 (interface + prototype adapter), IM-11 (commit core subset).

## Layout

| File               | Role                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `manifest.json`    | Campaign identity, spec + engine provenance, and `head` — the **single commit point**    |
| `state.<rev>.json` | Materialized canonical state (owner facts sorted by key) at one revision; human-readable |
| `journal.jsonl`    | Append-only, hash-chained committed groups with their receipts                           |
| `LOCK`             | Single-writer lock while open; a stale lock is reported, never silently broken           |

There is no campaign clock in the package: F-014B defines no universal tick, and no temporal model is introduced here. Identical inputs produce byte-identical files (no wall-clock or randomness; the campaign id is supplied by the caller).

## Commit protocol

1. Validate the group in memory (`CampaignCore.prepare`): schema, campaign, authority, registered owner/facet, per-fact `expected_version`, `reads`, `depends_on`, identity/idempotence. Nothing is visible yet.
2. Write `state.<rev+1>.json` (temp + fsync + rename).
3. Truncate any uncommitted journal tail, append the entry line (fsync).
4. Write the new `manifest.json` (temp + fsync + rename). **This is the commit.**
5. Best-effort removal of the superseded state file.

A failure in steps 2–4 returns `UNKNOWN_OUTCOME` and poisons the handle: reopen and reconcile with `lookupReceipt(intent_id)`; retrying the same group is safe (replay returns the original receipt, never a second commit). Anything after `head` in the manifest is _residue_: reported on open (`store.residue`), never adopted, discarded by the next commit.

## Load protocol (fail closed)

`openFileCampaign` verifies, in order: format and format version → manifest self hash → genesis (identity) hash → **spec identity equals this build's** (`SPEC_LOCK_MISMATCH` otherwise; no migration is authorized) → the whole journal is replayed from genesis (chain hashes, consecutive revisions, versions, reads, dependencies, receipts re-derived) → the journal head and derived state equal the manifest → the materialized state file equals the replayed state. Any failure returns a typed error and leaves nothing loaded or repaired.

Owner/facet registration is a property of the running build, not of history: replay does not re-check it, so an older save still loads when a build has fewer owners registered — its writes then fail closed.

## Integrity is not authentication

Hashes give corruption and tamper _evidence_. Someone who can rewrite every file consistently can forge a package; signing needs key management and is out of scope (no secrets in the repository).

## Known limits (deliberate, not adopted)

- Open cost is O(journal) because the full history is replayed and verified. No world/history-size cap is adopted (CAL-06); checkpointed open is a later optimization to be measured, not assumed.
- No secondary indexes, snapshots/branches or event-detail tiering yet.
- `unit`, `basis` and `secrecy` are opaque required identifiers: F-027 defines no vocabularies for them, so none are invented.
