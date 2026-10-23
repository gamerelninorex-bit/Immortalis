# Source-Qualified Local Corridor and Logistics Read Foundation

> **MECHANISM ONLY.** This slice has two halves and nothing else. (1) An out-of-character local console path lets a trusted, explicitly confirmed scenario author admit **ONE World-State physical corridor** — the directed topological fact that one already-established locus of an ORIGINAL world is connected **to** another, distinct, already-established locus of the same world — to a fresh pre-play campaign, **before any player character is bound**. (2) The existing one-leg, non-agentive, uncontended Logistics foundation gains an **explicitly source-qualified** commitment path that **actually reads and exact-pins** that corridor together with the independently admitted Movement Service Request and the entity's current origin and requested destination, and **refuses before its own commitment** when the corridor is missing, reversed, for another endpoint or world, or not World-State's own fact. It is not original-PC travel, general pathfinding, route or time calibration, actor agency, ordinary-chat play, a feasibility verdict, a new Location/Movement owner, a merge, a deployment or a gate promotion.

Authority: the BLUE v5.2-A1 bounded implementation brief "Source-Qualified Local Corridor and Logistics Read" (native pin `2026-10-22T13:47:37.910Z`) on official `main` `9f7a8f425a296784a2460c6f68eb4f4e6f502e7a` (after merged #81), under F-027 v1.0 (`spec/f027/spec-lock.json`, blob `98830019d8aea67392808308e588678c99d57e2c`, unchanged) and the frozen WG Working Operational Draft v1 (pin `2026-09-25T13:44:22.668Z`) "Geography / Traversal", "Edge / Corridor State" and "Ownership Guards", WS-010 Logistics (pin `2026-09-25T02:18:10.619Z`) §§2–5, 7–10, 19.3, 20, 23 and F-014B (pin `2026-09-25T23:42:29.547Z`), with the existing F-016 ECT-01 / F-017 due-stage chain used only when the already-implemented bounded Logistics transfer is exercised. **No source pin, Runtime Contract snapshot, open gate, acceptance row or status changed. F-028/OB-030 remains Blocked, PF-6 inactive, IA/V unpromoted.** Local success is not provider or recovery acceptance. PR #72 and PR #73 remain untouched and on hold; this slice is an independent change from `main`, depends on neither, on no Railway service, no API payment and no live client, and writes no existing campaign (`campaign-r5-phone`, `pc-namar-1` and every other save are untouched: every test builds a new, disposable, local package).

## What the corridor is — and is not

`world_corridor` is one new sealed fact kind registered under the **existing** World-State owner and the **existing** `world_locus` facet (no new owner, facet, Location/Movement owner or World-State Node): WG "Edge / Corridor State" says a connection between nodes or regions may carry independent causal state without becoming a Node, and "Ownership Guards" assigns World-State topology and world-side geographic and topological facts to World-State.

```
key:    world/<world_id>/corridor/<from_locus_id>/<to_locus_id>
value:  { world: FactRef, from: FactRef, to: FactRef, statement: Text }   (strict)
```

- The **ordered pair is the key**: a second, changed or duplicate corridor for the same ordered pair is a version conflict, never a sibling truth. The **reverse** connection is a different key that exists only if it is independently authored and confirmed; no reverse edge, intermediate locus or absence of hazards is inferred.
- The value is **topology only**. The schema is strict and the source prescribes no vocabulary, so there is **no field** in which a distance, travel time, speed, throughput, capacity, passability, right of access, hazard verdict, route cost, carrier, "usable" claim, actor agreement or traversal outcome could be stored. `statement` is the author's free prose, preserved verbatim and never interpreted. No enum, literal or default was introduced beyond what the source states.
- It is **create-only** (SEALED). Admission re-derives it from committed facts: the world and both endpoint loci are committed, each endpoint is a locus **of that world**, the endpoints are distinct, and the corridor sits at the key its ordered endpoints derive. It reads and depends on all three, never creating them. Load verification (`verifyCanonicalIntegrity`) re-checks the same single rule (`worldCorridorViolation`, shared) plus the commit order and that the group read the exact pinned versions and depended on the groups that committed them.
- **Owner exclusivity** is the existing registry's: no other owner or facet (the movement requester, Logistics, Production, Economy, the kernel, the PC and role owners, every other World-State facet) can write a corridor key. A fabricated or foreign-owner edge is refused.

The owner operation is `CanonicalCampaign.establishCorridor` (identities and the authored statement only; the references are derived), read back by `CanonicalCampaign.corridor(world, from, to)`.

## The command

```
immortalis-operator establish-corridor --campaign <dir> --campaign-id <id> --corridor-file <file> [--operator-dir <dir>] [--reclaim-stale-lock]
```

The corridor file is one strict JSON document:

```
{
  "format": "immortalis-corridor",
  "format_version": 1,
  "corridor": { "world_id", "from_locus_id", "to_locus_id", "statement" }
}
```

The `corridor` section is exactly the owner operation's own strict `EstablishCorridorInput`. The file can carry no owner, facet, version, depth, publication label, duration, speed, capacity, access right, hazard, passability, feasibility, delivery, reverse, via-locus, actor, or "confirmed" claim (each is an unknown field and is refused). It is read once, from one open descriptor: a regular file (not a link) owned by the invoking OS user and writable by nobody else, of bounded size. What was read is what is shown, confirmed and committed; a file changed afterwards cannot change it.

### Sequence

1. **Read and check the file** (above). Nothing is asked of the console if it is refused: `CORRIDOR_FILE_UNTRUSTED`, `CORRIDOR_FILE_UNREADABLE`, `INVALID_CORRIDOR`.
2. **Open the existing package** for the local operator (OS-user verification of the package and the retained-state directory, the package lock, journal replay and canonical integrity). This command **never creates, adopts, repairs or clears** a package: a missing, foreign or not-exclusively-owned directory, or another campaign identity, is `SESSION_UNAVAILABLE`.
3. **Read the established locality from canon** (`establishedLocality`, read-only, shared with the other pre-play paths). None held → `LOCALITY_NOT_ESTABLISHED`; held but since advanced → `PRE_PLAY_CLOSED`.
4. **If this identity already committed** (a repeat, a lost reply, a restart): judge it on the immutable committed group. When it committed with the content of this file, it is verified and reported **without asking again and without a write**; a different corridor under the ordered pair, or an identity whose record disagrees with this file, is `CORRIDOR_CONFLICT`.
5. **Pre-play and consistency refusals**, all before the console is asked and with no write: a bound player character → `PRE_PLAY_CLOSED`; another world → `WORLD_MISMATCH`; an endpoint that is not a committed locus of that world → `LOCUS_NOT_ESTABLISHED` (a corridor never creates a locus); canonical integrity violations → `CORRIDOR_VERIFICATION_FAILED`.
6. **Prove the owner path admits it**: the committed world and both loci are republished on a scratch package that is then removed, and the corridor is run through the genuine `establishCorridor`. A refusal is `INVALID_CORRIDOR` with nothing written.
7. **Confirm, once.** The whole connection is shown (authored text JSON-quoted so a control sequence cannot rewrite the console) with what it does **not** do. The operator types `establish-corridor <fresh challenge>` on the very next line; anything else, a stale or pre-typed line, another verb's phrase or end of input declines and nothing has been written. The confirmation is a one-time token bound to the verb and the exact subject.
8. **Commit** the corridor through `CanonicalCampaign.establishCorridor` (`PROGRESS corridor COMMITTED …`). The operator never writes the fact directly.
9. **Verify on a fresh reopen.** The package is closed and reopened through the engine's owner-verified open; the corridor's key, owner/facet, version 1, typed value and committed provenance are compared with the confirmed proposal, **every fact the campaign held before is compared with its pre-commit self**, and the fact count and revision are exactly one greater. Only then is `CORRIDOR_READY` reported.

Statuses: `CORRIDOR_READY`, `CORRIDOR_OUTCOME_UNKNOWN`, `CORRIDOR_REFUSED`, `CORRIDOR_VERIFICATION_FAILED`, `LOCALITY_NOT_ESTABLISHED`, `PRE_PLAY_CLOSED`, `WORLD_MISMATCH`, `LOCUS_NOT_ESTABLISHED`, `CORRIDOR_CONFLICT`, `SESSION_UNAVAILABLE`, `DECLINED`, `INVALID_CORRIDOR`, `CORRIDOR_FILE_UNTRUSTED`, `CORRIDOR_FILE_UNREADABLE`. `CORRIDOR_READY` means exactly: this corridor is committed under this identity, verifies, and nothing earlier changed. It is not reachability, traversal, permission, perception or knowledge.

### Identity, convergence and fail-closed

The service authors only the technical publication identity and derives it from the exact authored content, never from a clock or a random value: `<id>` is a hash of the campaign identity and the corridor section, giving group `operator-corridor:<id>`, intent `operator-corridor-intent:<id>` and cause `operator-corridor-cause:<id>`. The same confirmed proposal always reaches the same identity; a retry after a crash or a lost reply replays what committed (RC-16) and never writes a second, rerolled or altered corridor. Any different content under the same ordered pair meets the committed key and is refused. No retained state is added: the committed record in the package is the only memory of what committed.

## The source-qualified Logistics consumer

`LogisticsAdapter.commitCorridorMovement` is a **separate, explicitly source-qualified path** beside the unchanged `commitMovement`. Its input is the request key, the **named** corridor key (never searched for) and the **caller-declared** delivery boundary. Logistics:

1. reads the independently admitted Movement Service Request, the moved entity (so its current stationary origin) and the named corridor from committed state;
2. refuses with **no write** when the corridor is absent (`PREREQUISITE_MISSING`) or is not the source-owned connection of _this ordered origin to this destination in this world_ — a reverse, wrong-endpoint or wrong-world corridor derives a different key (`INPUT_INVALID`) — or is not World-State's own fact;
3. otherwise commits the **same** commitment the foundation commits, with one added field: `corridor: { owner: "world_state", fact_key, version }`, the pin of the exact corridor version read. The group **reads** the corridor and the entity's origin locus at their current versions and **depends on** the groups that committed them.

The corridor **supplies no duration or boundary** (the declared delivery boundary stays the caller's and must lie strictly after the commitment), asserts no delivery, waives no other input, and the request, entity, owner commitment, dispatch, due stage, destination commit and retirement are the existing ones, unchanged. If other material service, compatibility, access, actor, environmental or physical inputs become engaged, they are unresolved until their own source owners establish them; this slice defines none of them and renders no feasibility verdict.

- **The route-less foundation is preserved.** `corridor` is an optional field: its absence is the original commitment, serialized byte for byte as before, still lawful, still verified as before, and a world holding corridors does not retroactively change it. The commitment's fixed literals and every existing branch are untouched; the temporal object, delivery and retirement stages and the movement-locus resolver are unchanged.
- **Admission (IM-11) re-derives** a corridor-qualified commitment: the corridor must be committed, read at its current version, depended on, owned by World-State, still hold as a corridor of its world, and be pinned at exactly that version; the derived commitment must equal the written one. It holds for a raw `store.commit` and for a tampered group.
- **Load verification** re-derives the same commitment against the pinned corridor, requires the corridor to have been committed before the commitment, and requires the committed group to have read the exact pin and depended on the corridor's group. A missing, rewritten, re-versioned or re-owned corridor, or a pin no longer the movement's connection, fails the open.
- **The active PC is moved by this path only by its own PC-owned request** (as at the foundation, the derivation refuses a PC moved by any other request, and a PC-owned request moves only its PC). As first merged, this slice refused the active PC outright and moved an accepted fallback physical entity only; the later corridor-qualified relocation slice (`docs/protocol-pc-corridor-relocation-foundation.md`) narrowed that one refusal, and only that, to admit the confirmed post-handover PC. Original-PC travel, which needs its own movement admission, identity and authority, is still not provided.

## Recovery

The package's own file lock and durable-write order are used unchanged. A kill leaves the lock; it is refused until the operator explicitly passes `--reclaim-stale-lock`, which the engine honours only for a provably dead holder. The operator tests interrupt before the corridor, after the corridor and before the reply, after the close and before the readback (a failed reopen), by an uncertain store outcome, by a real `SIGKILL` of the shipped binary at the console and after the commit, and by a failure before **and** after every mutating filesystem operation of the whole command; each converges on the uninterrupted campaign (equal head, state and journal hashes). The engine tests save, close, reopen and continue at every durable cut of the corridor-qualified lifecycle (corridor authored; entity and request present; commitment; dispatch; registration; delivery established, destination not yet committed; destination committed, retirement pending; all stages committed, kernel transaction not; complete), and fail at every durable step of the corridor publication, of the corridor-qualified commitment and of the completion transaction. An altered corridor, boundary or request on retry is refused without a second commitment, movement or arrival.

## Security

The full proposal is shown only on the operator's own console and held only in the owner-verified package. It is not written to the retained-state directory, and no host-facing surface (referee, player-view, observe-request or advance-request MCP servers) imports or names this command or the corridor. **No MCP, phone or client corridor creation tool is added.** The module has no network, child-process, environment or global-state access. Outside its scratch dry run, the module's only canon write is the existing `establishCorridor`.

## Evidence

`tests/contract/world-corridor-schemas.test.ts` (strict contract, no duration/rate/access/outcome field, derived references, optional commitment pin), `tests/unit/logistics-corridor-derive.test.ts` (each derivation rule and refusal in isolation, including a foreign-owner corridor and the active PC), `tests/unit/corridor-file.test.ts` (file trust, strictness, identity), `tests/integration/logistics-corridor-foundation.test.ts` (the engine causal witness: corridor → pinned commitment → dispatch → due → delivery → destination commit → retirement, exactly one owner answering the locus at every cut), `tests/integration/logistics-corridor-enforcement.test.ts` (owner exclusivity, raw and tampered corridors and commitments, missing/reversed/wrong-endpoint/wrong-world/stale corridors, duplicates, retries, load drift), `tests/integration/logistics-corridor-recovery.test.ts`, `tests/integration/corridor-foundation.test.ts`, `corridor-refusals.test.ts`, `corridor-recovery.test.ts` (the shipped command), `tests/integration/corridor-logistics-witness.test.ts` (a corridor authored by the shipped command, then consumed by Logistics), `tests/security/corridor-security.test.ts` and `tests/conformance/corridor-conformance.test.ts`.

## Mechanical pin adjustments

Predecessor conformance tests pin the bytes of the source files this slice must touch to exist at all, the engine's module and registry inventories, and the operator package's exported surface. Their pins were adjusted openly, as earlier slices did, and nothing else in those tests changed (no behavior assertion was weakened or removed):

- **Engine and contracts files this slice edits (additively):** `contracts/src/index.ts` (one export), `contracts/src/logistics.ts` (the optional pin and the source-qualified input), `engine/src/logistics/{adapter,admission,derive,integrity}.ts`, `engine/src/owners/{registry,admission}.ts`, `engine/src/world/{canonical-campaign,integrity}.ts`, and `operator/src/{cli,confirmation,index}.ts`. Every predecessor conformance test that pins one of these files "byte-identical to the base" or "pinned at the slice head" carries the new hash of that file (22 tests; the hash literal is the only change).
- **Module and kind inventories:** the new modules are `contracts/src/world-corridor.ts`, `engine/src/world/corridor.ts` and `operator/src/corridor.ts`. The tests that list the engine `world/` directory (entity transition, existing-actor compilation/coupling/handover, PC locus custody, PC capability carry-forward, Production) and the operator `src/` directory (observe-request, player-view MCP) gained the new file name; the tests that list World-State's kinds (existing-actor coupling, PC locus custody, PC movement) gained `world_corridor`; the Logistics adapter method list (PC movement and the central oracle) gained `commitCorridorMovement`; the operator export list gained `corridorId`, `establishCorridor` and `readCorridorFile`.
- **The central oracle** (`tests/support/expected-surface.ts`) acknowledges the one new kind (`world_corridor`, World-State / `world_locus`, SEALED) and the one new adapter method, once, as its maintenance note directs. No owner, facet, key-space exclusivity rule or sealing rule was relaxed.

Unchanged and pinned byte-for-byte by `tests/conformance/corridor-conformance.test.ts`: the F-027 lock, gates and register, the World-State contracts, the temporal coordinator and contract, the entity-transition contract and seam, the Logistics stage providers, the temporal declaration and the locus resolver, `locality.ts`, `commands.ts`, `session.ts`, `ooc.ts` and the two earlier admission modules.

## Not claimed

Nothing here is deployment, a Railway dependency, API payment, a live client or a gate promotion. It is not a route, distance or travel-time producer, a general pathfinder, a world builder, original-PC travel, repeat-journey identity or release, actor- or capability-sensitive duration, source-covered access or compatibility, real AI/client/player confirmation or knowledge, or an ordinary independent NPC act; the source corridor is not an answer to any of those later results. Local success is level-1 mechanism evidence only, not genuine AI-host semantics or normal-client gameplay, and its merge is separately reserved to the Sovereign.
