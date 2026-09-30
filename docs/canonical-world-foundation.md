# Canonical World Identity & Owner Foundation

Second bounded slice, built on the Campaign Continuity Foundation (`docs/campaign-package.md`). A campaign can now hold **one World Profile, one bounded locus, one released player-character Existence Contract and one active `role.player_character` binding between them — each written by the owner the pinned sources assign** — and all of it survives save → close → load → continue.

Governing lock: `spec/f027/spec-lock.json` (F-027 v1.0). No provider, host protocol, migration or gameplay mechanic is added; every F-027 open gate is unchanged.

## Owners (IM-03 owner resolver; `packages/engine/src/owners/registry.ts`)

| Fact                            | Owner / facet                                | Assigned by (pinned source)                                                                                                                                                        | IM    | RC           |
| ------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------ |
| World Profile                   | `world_state` / `world_profile`              | WG "World Generation May Own"; Output Packet items 1–4                                                                                                                             | IM-03 | RC-02        |
| World locus                     | `world_state` / `world_locus`                | WG Output Packet item 4 (Insertion-Supporting World Constraints); Interface Handoffs → Insertion                                                                                   | IM-03 | RC-02        |
| PC Existence Contract           | `pc_existence` / `existence_contract`        | I-002 §2 ("canonical current intrinsic Existence Contract"), §2.1 (writer `role.archivist`), §4, §21, §26                                                                          | IM-07 | RC-02        |
| `role.player_character` binding | `role_registry` / `player_character_binding` | IR §17 ("active `role.player_character` binding → Role Registry / F-014C"); Handover "Single Commit Point" (Insertion decides and commits the Role Registry change); F-014C; RC-13 | IM-07 | RC-02, RC-13 |

Every registration carries the exact source `SourceRef` (RC-01) that is recorded as the governing rule of each commit. `tests/conformance/world-foundation-conformance.test.ts` cross-checks each citation, pin and IM lowering against `spec-lock.json`, so a pin cannot drift silently. Owner, facet, key-space and value-schema names are technical encodings (the sources prescribe no serialization vocabulary); the _assignment_ is the source's. There is **no fallback owner**.

## How it is enforced

- **`CanonicalCampaign`** (`world/canonical-campaign.ts`) is the acceptance path. A caller supplies authored content and identities. It never supplies an owner, facet, authority or rule; those come from the registry, and every publication is made by the archivist path (`role.archivist` + `permission.canon.write`).
- **`canonicalAdmission`** (`owners/admission.ts`), a `WriteAdmission` consulted by the commit core (IM-11) for new commits, makes the rules hold for a raw `store.commit` too:
  1. **Key space** — each key belongs to exactly one fact kind and that kind's owner/facet must be the group's (`KEY_NOT_ADMITTED`). An existing fact under another owner is refused by the core (`FACT_OWNER_CONFLICT`).
  2. **Typed, strict values** — unknown fields are rejected, so a value cannot carry a copy of a foreign owner's fact; the identity in the value must equal the identity in the key (`VALUE_INVALID`).
  3. **Sealed canon** — these facts are create-only. Overwriting a sealed baseline, a released contract or the binding needs an owner amendment mechanism that does not exist (`AMENDMENT_NOT_SUPPORTED`).
  4. **Dependency direction** — a locus needs its world; the binding needs the PC contract, the world and the locus, each already committed, read at its current version and depended upon (`PREREQUISITE_MISSING`, `REFERENCE_INVALID`). The binding group writes only the binding, so it can neither create nor precede its prerequisites. The PC contract and the world depend on nothing.
- **`verifyCanonicalIntegrity`** (`world/integrity.ts`) runs on every `CanonicalCampaign.open`, after journal replay. Replay proves the _history_ is intact; this proves the _meaning_ still matches the build's owners: owner/facet per key, typed values, governing-rule provenance, create-only versions, archivist authority, and that each dependent fact was committed after its prerequisites. Any violation fails the open with `CANON_INTEGRITY`.

## What the facts hold (`packages/contracts/src/world-foundation.ts`)

- **World Profile** — the WG four-part packet: premise; reference/causal basis (`EXACT_NAMED_SETTING`, `INSPIRED_BY`, `FACTUAL_HISTORICAL`, `ORIGINAL`); material world-law departures; insertion-supporting constraints.
- **Locus** — stable identity, a _reference_ to its world, the broad locus as authored, constraints. Not asserted to be a World-State Node.
- **Existence Contract** — the I-002 §4 six-part minimum (identity/agency, contact anchor **or explicit NO-CONTACT**, embodiment, continuity, baseline/exception, entry envelope) plus the Generation Hand-Off release with its Character Mirror acceptance record. Intrinsic claims may only be `PLAYER-AUTHORED` or `SAFELY-INHERITED` (host-context firewall). It holds no world state, relationships, knowledge, skills or binding.
- **Binding** — RC-13: active PC reference, active locus relation, initiating transition (`ACTIVATION`), prior/replacement (`null`), intrinsic-authority migration (empty), writer identity/permission. NULL (no active PC) is the _absence_ of the fact; "effective commit" is the fact's provenance and receipt. Foreign facts are referenced, never copied.

## Deliberately not implemented (fail closed, not guessed)

Delegated worlds/PCs (need sealed Delegation Commit Records); `PLAYER-ADMITTED` host/personal context; conditional I-002 modules, Starting Endowment, capabilities; SETTING-PREMISE routing; any transition other than first `ACTIVATION` (deactivation, transfer, reactivation, fork/succession, deferred/`ACTIVE-LIMITED` binding modes, existing-actor handover); amendment of sealed canon (Intrinsic Amendment Events, world evolution); the interactive Character/Setting Mirror (the engine records the acceptance evidence verbatim and does not judge whether the displayed set is the complete mandatory confirmation set); authentication of the archivist caller (OB-016/IA-28 remain open).

## Judgment calls and open residuals

- **Binding owner.** IR §2 says Insertion "owns" the binding while §17 and the Handover contract place the durable record in the Role Registry / F-014C and Insertion _decides and commits_ the change. The record is registered to `role_registry`; IR is the governing rule and the transition decider.
- **Facet split.** `world_profile` vs `world_locus` are technical facets of the one World-State owner.
- **`basis` and `secrecy`** (RC-02) have no F-027 vocabulary. They are authored publication input, preserved verbatim and never defaulted; `unit` is an explicit `null` (non-quantitative facts).
- **One world / one PC per campaign is not enforced** — no source states such a cardinality. One active binding per `role.player` is (single slot).
- Cost: `verifyCanonicalIntegrity` lists all canonical facts once per open — a diagnostic path proportional to the number of canonical facts (CAL-06), on top of the existing O(journal) open.

## Evidence

`tests/contract/world-foundation-schemas.test.ts`, `tests/unit/owner-admission.test.ts`, `tests/integration/world-foundation.test.ts` (real OS-process boundaries: establish → close → load + bind → close → load + replay), `tests/conformance/world-foundation-conformance.test.ts`. Register rows IA-01/02/03/28 gained narrowly scoped `partial_evidence`; no row changed status. Local success is not provider or recovery acceptance (IA-07 BLOCKED).
