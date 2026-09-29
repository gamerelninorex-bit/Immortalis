# Immortalis

LLM-neutral persistent narrative and world-simulation engine (Resurreccion Core).

**Status: repository bootstrap.** This repository contains the skeleton, implementation charter, F-027 spec snapshot/lock, acceptance and open-gate registers, and CI. No engine behavior, vertical slice, persistence/deployment provider or migration exists.

## Governing specification

- Implementation package: F-027 v1.0 — see [`spec/f027/spec-lock.json`](spec/f027/spec-lock.json) (exact Notion pins). "Latest Notion" is never an implicit build input.
- Rules for contributors and agents: [`IMPLEMENTATION_CHARTER.md`](IMPLEMENTATION_CHARTER.md), [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md).
- Notion is the design/governance source of truth; GitHub is the implementation/version/review source of truth.

## Layout

| Path                       | Purpose                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| `spec/f027/`               | Version-locked implementation snapshot, acceptance register, open gates |
| `packages/contracts`       | RC-01–RC-16 executable contracts (placeholder)                          |
| `packages/engine`          | Provider-neutral core, IM-01–IM-14 + IM-17 interface (placeholder)      |
| `packages/protocol`        | Host Protocol Gateway and security boundary, IM-15/IM-16 (placeholder)  |
| `packages/testkit`         | Shared deterministic fixtures and evidence helpers (placeholder)        |
| `tests/`                   | unit, contract, conformance, security, integration                      |
| `tools/`                   | `check-spec.ts` spec-lock / register consistency check                  |
| `migrations/`, `releases/` | Inert conventions only                                                  |

Directories for surfaces not yet used (e.g. `engine/src/temporal`, `tests/recovery`, `tests/scaling`) are created when first needed.

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
