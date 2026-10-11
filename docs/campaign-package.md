# Campaign package (prototype structured-file persistence)

Implements the provider-neutral IM-17 contract (`packages/engine/src/persistence/store.ts`) with a local, free, deterministic file package, per the Runtime, Save & Implementation Roadmap ("structured-file playable prototype"). **This is not a provider adoption.** It claims no restart/failover/PITR/backup/archive-restore acceptance: IA-07 and CAL-09 remain `BLOCKED`/`UNRUN`.

Governing lock: `spec/f027/spec-lock.json`. Contracts used: RC-01 SourceRef, RC-02 OwnerFact, RC-07 CommitGroup (input side), RC-16 receipt/recovery identity. Boundary: IM-17 (interface + prototype adapter), IM-11 (commit core subset).

## Layout

| File               | Role                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `manifest.json`    | Campaign identity, spec + engine provenance, and `head` — the **single commit point**      |
| `state.<rev>.json` | Materialized canonical state (owner facts sorted by key) at one revision; human-readable   |
| `journal.jsonl`    | Append-only, hash-chained committed groups with their receipts                             |
| `LOCK`             | Single-writer lock while open; a stale lock is reported, never silently broken (see below) |

**Single-writer lock.** `LOCK` carries `{pid, campaign_id, nonce, host}`; a legacy `{pid, campaign_id}` body is still read, identified by a hash of its bytes. It is a technical file only and never publishes a world fact. Every removal or replacement of a lock instance is done under the exclusive claim `LOCK.claim.<instance id>` (atomic create) after re-reading `LOCK` under that claim, so a contender acting on a stale observation of a dead holder cannot remove a successor's live lock; an abandoned claim is replaced by claiming that claim, and `close()` uses the same rule, so a handle that lost the lock cannot release or write as the writer (its commits are refused with `STORE_CLOSED`, `details.reason` `WRITER_LOCK_LOST` / `WRITER_LOCK_UNVERIFIED`). `reclaimStaleLock` still defaults to `false`; with `true` only a holder that is provably dead (`ESRCH`) on this host is replaced. An unparseable, unknown, other-host or live holder is refused. `LOCK.*` files (claims, `*.tmp`) are never canonical data or reported residue. Environment contract: a local filesystem with atomic `link(2)` (lock and claim files are published complete or not at all; a filesystem that cannot hard-link is refused explicitly with `EATOMIC_PUBLISH_UNSUPPORTED` — create fails, open returns `LOCKED` naming the cause — never silently weakened), and every opener sharing one host and PID namespace. A failed open, including a thrown I/O error during load, releases only its own lock. A killed process can leave inert `LOCK.*` files; none block recovery, including a chain of any number of successively killed recoverers (each link is a distinct nonce, so recovery walks the finite on-disk chain; a self-referencing chain is refused).

There is no campaign clock in the package: F-014B defines no universal tick, and no temporal model is introduced here. Identical inputs produce byte-identical files (no wall-clock or randomness; the campaign id is supplied by the caller).

## Commit protocol

1. Validate the group in memory (`CampaignCore.prepare`): schema, campaign, authority, registered owner/facet (and, when the build supplies one, its IM-03 write admission — see `docs/canonical-world-foundation.md`), per-fact `expected_version`, `reads`, `depends_on`, identity/idempotence. Nothing is visible yet.
2. Write `state.<rev+1>.json` (temp + fsync + rename).
3. Truncate any uncommitted journal tail, append the entry line (fsync).
4. Write the new `manifest.json` (temp + fsync + rename). **This is the commit.**
5. Best-effort removal of the superseded state file.

A failure in steps 2–4 returns `UNKNOWN_OUTCOME` and poisons the handle: reopen and reconcile with `lookupReceipt(intent_id)`; retrying the same group is safe (replay returns the original receipt, never a second commit). Anything after `head` in the manifest is _residue_: reported on open (`store.residue`), never adopted, discarded by the next commit.

## Load protocol (fail closed)

`openFileCampaign` verifies, in order: format and format version → manifest self hash → genesis (identity) hash → **Runtime Contract compatibility** (`RUNTIME_CONTRACT_INCOMPATIBLE` unless the save's contract hash is one this build is declared compatible with; no migration is authorized) → the whole journal is replayed from genesis (chain hashes, consecutive revisions, versions, reads, dependencies, receipts re-derived) → the journal head and derived state equal the manifest → the materialized state file equals the replayed state. Any failure returns a typed error and leaves nothing loaded or repaired.

Owner/facet registration is a property of the running build, not of history: replay does not re-check it, so an older save still loads when a build has fewer owners registered — its writes then fail closed.

## Provenance vs compatibility

Two things are recorded and deliberately kept apart:

- **Provenance** (exact, never lossy): `spec_identity` (the spec line the campaign was created under, immutable, part of the genesis hash), `last_saved_spec_identity` (the line in force at the latest save), `created_with` / `last_saved_with` (engine build), and the `spec_lock_sha256` in each receipt. Provenance never gates loading; `store.provenanceDrift` reports when the last save's line differs from the running build's.
- **Compatibility**: `compatibility.runtime_contract_sha256`, the hash of `spec/f027/runtime-contract.md` (RC-01–RC-16 and the IM map). A build loads a save only if that hash is in `COMPATIBLE_RUNTIME_CONTRACT_SHA256S` (by default only its own). Changing the lock file, acceptance register, open-gate wording or pins does **not** change it, so evidence-only changes cannot strand saves. A genuinely different Runtime Contract, or a different package `format_version`, fails closed until a lawful compatibility declaration (add the older hash, reviewed as a spec-affecting change) or a separately authorized migration exists.

Replay takes the lock hash for each entry from that entry's own hash-chained receipt, so later lock changes cannot alter how history verifies.

## Integrity is not authentication

Hashes give corruption and tamper _evidence_. Someone who can rewrite every file consistently can forge a package; signing needs key management and is out of scope (no secrets in the repository).

## Known limits (deliberate, not adopted)

- Open cost is O(journal) because the full history is replayed and verified. No world/history-size cap is adopted (CAL-06); checkpointed open is a later optimization to be measured, not assumed.
- No secondary indexes, snapshots/branches or event-detail tiering yet.
- `unit`, `basis` and `secrecy` are opaque required identifiers: F-027 defines no vocabularies for them, so none are invented.
