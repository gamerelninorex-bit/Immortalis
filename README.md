# Immortalis

LLM-neutral persistent narrative and world-simulation engine (Resurreccion Core).

**Status: Turnless Temporal & Resolution Transaction Foundation.** Builds on the Campaign Continuity Foundation (see [`docs/campaign-package.md`](docs/campaign-package.md)): a campaign can now hold one World Profile, one bounded locus, one released player-character Existence Contract and one active `role.player_character` binding — each written by the specification-backed owner, with dependency direction and owner exclusivity enforced — and it survives save → close → load → continue (see [`docs/canonical-world-foundation.md`](docs/canonical-world-foundation.md)). On top of that, the IM-02 Temporal / Dependency Coordinator lets the campaign advance from a canonical temporal basis toward a bounded target, resolve only the causally engaged dependency cone (exact NOW / named-CLOSE reads, exact stage identity, a transient non-persisted dependency graph), stop with a lawful remainder and — after save, close and load — continue without drift, all through the same commit/journal/package substrate (see [`docs/temporal-foundation.md`](docs/temporal-foundation.md)). There is no turn counter, tick or phase loop, and CAL-01 is not used (the proof is `EXACT-PARTITION`). No persistence/deployment provider, host protocol, migration, population, economy or other gameplay mechanic exists, and every F-027 open gate remains open.

## Governing specification

- Implementation package: F-027 v1.0 — see [`spec/f027/spec-lock.json`](spec/f027/spec-lock.json) (exact Notion pins). "Latest Notion" is never an implicit build input.
- Rules for contributors and agents: [`IMPLEMENTATION_CHARTER.md`](IMPLEMENTATION_CHARTER.md), [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md).
- Notion is the design/governance source of truth; GitHub is the implementation/version/review source of truth.

## Layout

| Path                       | Purpose                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `spec/f027/`               | Version-locked implementation snapshot, acceptance register, open gates                                   |
| `packages/contracts`       | Executable RC contracts used so far (RC-01/02/03/04/05/07/10/13/16, world/PC/binding and temporal values) |
| `packages/engine`          | Provider-neutral core: commit core, IM-03 owners, IM-07 PC/binding, IM-02 temporal coordinator, IM-17     |
| `packages/protocol`        | Host Protocol Gateway and security boundary, IM-15/IM-16 (placeholder)                                    |
| `packages/testkit`         | Shared deterministic fixtures and evidence helpers (placeholder)                                          |
| `tests/`                   | unit, contract, conformance, security, integration                                                        |
| `tools/`                   | `check-spec.ts` spec-lock / register consistency check                                                    |
| `migrations/`, `releases/` | Inert conventions only                                                                                    |

Directories for surfaces not yet used (e.g. `tests/recovery`, `tests/scaling`) are created when first needed.

## Developer commands

Requires Node 22.22.2 and pnpm 10.33.0.

```sh
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run check:spec
pnpm test            # or test:unit | test:contract | test:conformance | test:security | test:integration
pnpm run ci          # all of the above
```
