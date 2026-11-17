# S-4 initial Standing Instruction ledger — foundation (MECHANISM ONLY, T1)

Governing construction brief: BLUE F-014B S-4 Initial Ledger — Scoped Hard Preflight PASS & Pinned Codex Construction Brief
(Notion native pin `2026-11-17T04:59:46.616Z`, <https://app.notion.com/p/41b20af901e08196ac56e27f0d91e4b7>), Part B. Ratified
source: BLUE S-4 v0.4 (`2026-11-15T13:54:22.606Z`) and its Sovereign ratification (`2026-11-15T14:02:45.229Z`). Neither is a spec-lock pin;
`spec/f027/spec-lock.json` is unchanged. Exact base `c6ea29d3ccd7cadb83a622dc47704f449f63513b`. Evidence:
[`docs/evidence/s4-initial-ledger/README.md`](evidence/s4-initial-ledger/README.md).

## What this adds

Each player character gets a properly recorded, tamper-checked place where Standing Instructions can LATER be stored, opened
automatically and silently inside normal character creation. **It records no instruction.** It does not let the GM write, interpret
or revoke an instruction, act on one, wait, or reveal a Brief; there is no GM reader, no public tool and no player-facing
terminology. An empty ledger says only that this carrier had none enrolled under that source at that cut — never that the player has no
intentions, promises or older fictional directions — and it is never `PLAYER-AUTHORED`.

| Element                                                                               | Where                                                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Strict values, fixed keys, the content digest                                         | `packages/contracts/src/pc-standing-ledger.ts`                                                   |
| Pure derivations and the shared rule (identity, digest, origin, binding prerequisite) | `packages/engine/src/owners/pc-standing-ledger.ts`                                               |
| IM-03 admission of the ledger group and of the binding prerequisite; replay verifier  | `packages/engine/src/owners/pc-standing-ledger-admission.ts` (called from `owners/admission.ts`) |
| Two registered kinds, the S-4 rules, the binding's additive citation                  | `packages/engine/src/owners/registry.ts`                                                         |
| Cold-open verification                                                                | `packages/engine/src/world/integrity.ts`                                                         |
| The trusted owner operations                                                          | `packages/engine/src/world/canonical-campaign.ts`                                                |
| The one shipped native-character path                                                 | `packages/operator/src/original-pc.ts`                                                           |

## The carrier

Owner `pc_existence`, a separate NON-INTRINSIC facet `standing_instruction_ledger`, unrelated to `existence_contract`. Two kinds:

- `pc_standing_instruction_ledger_head` — ADVANCING, key `pc/{pc_id}/standing-instruction-ledger/head`: `{ pc_id, current: { fact_key, version }, content_sha256 }`.
- `pc_standing_instruction_ledger_version` — SEALED, create-only, key `pc/{pc_id}/standing-instruction-ledger/version/{sequence}`:
  `{ pc_id, sequence: 1, origin, instructions: [], previous: null, content_sha256 }`. `[]` and `null` are distinct required values.

`content_sha256` is the SHA-256 of the UTF-8 canonical JSON of the version **without** its digest. It is re-derived, never trusted, at
admission, in replay and on reopen. Only the first version exists: every later advance, overwrite or second version is refused.

**Origin** (a strict discriminated union): `ENGINE_ORIGIN_LEDGER_CLOSURE` (a newly created PC: the PC's released Existence Contract and the
applicable `world_setup_closure`, or an explicit `null` where the route uses none) or `START_OF_LEDGER` (an existing bound PC: its original
operative binding). Every reference is `{ fact_key, version, commit: { group_id, intent_id } }`, checked against the committed fact.

**Identity** is derived from the source facts only: `s4-ledger-{group,intent,cause}:<SHA-256 of canonical JSON of [tag, pc_id, source facts]>`.
For L-2 it is exactly `["S4_START_OF_LEDGER_V1", pc_id, original binding commit identity]` — never a clock, session, horizon or nonce — so a
retry in another session or at another canonical time finds the same single head.

## Order and the binding prerequisite

setup → `world_setup_closure` (where used) → **ledger (one atomic `pc_existence` group)** → binding (its own `role_registry` group).

- `SETUP_ELIGIBLE_KIND_IDS` is unchanged. The ledger kinds are not setup kinds, so a ledger committed before a needed closure would end
  setup eligibility and strand it: the initializer therefore refuses while any world still owes a closure, and a closure after a ledger is
  refused by the existing predicate.
- Both binding variants (`ACTIVATION`, `EXISTING_ACTOR_HANDOVER`) read the PC's head and version at their exact versions and depend on the
  group that committed them, so the head is necessarily strictly older. The binding value (`PlayerCharacterBindingSchema`) is unchanged.
- A NEW binding must cite the S-4 rule, registered as an additive `alternateRules` entry of the binding kind (the same device the
  freight slice used). `FACT_KINDS`, and so the frozen-lock citation, is untouched. An authentic old binding (original citation, no ledger)
  keeps loading and replays under its original policy; a FRESH write citing the original citation is refused. The ledger check runs
  **last**, so every existing refusal keeps its reason and precedence.
- The "applicable closure" is judged at binding time against the world the binding couples: non-null iff that world has a closure, and
  exactly that closure. A closure of another world is refused in both directions.
- `historyVerificationId` gains the S-4 suffix, so checkpoint evidence earned before is never trusted and the first open replays strictly.

## Recovery

A head with no binding is inert. The initializer is idempotent by derived identity: the same request replays the receipt; a retry after the
binding has also committed is reconciled against the durable ledger and creates nothing; a changed payload under the same identity is an
`INTENT_CONFLICT`. Nothing calls L-2 on open: reopening a save never mutates it.

## Not here (BLUE brief B5)

Class 2 authoring, amendment and revocation; affirmative setup capture; the GM standing-text reader; the F-014B §10 evaluator and the other
LC families; GM waiting and PAUSED/HELD/INTERRUPTED/RESUME; the T0 barrier for legacy waits; delegated action; completed Briefs; deployment,
paid retained hosts and release. The setup-eligibility set, `spec/f027/spec-lock.json` and `IMPLEMENTATION_CHARTER.md` are byte-identical.
