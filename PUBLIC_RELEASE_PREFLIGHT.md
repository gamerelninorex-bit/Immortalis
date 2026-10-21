# IMMORTALIS — Public Repository Release Preflight
**Date:** 2026-10-21 (Asia/Manila)  
**Status:** **HOLD — public release is not yet cleared.**  
**Scope:** Read-only audit of available GitHub metadata and selected files, plus isolated AGPLv3 preparation. Not implementation acceptance, security certification, or legal opinion.

## Release identity and preservation
- Intended license: **AGPL-3.0-only**; full license text staged in [LICENSE](LICENSE).
- Copyright designation supplied by repository owner: **Copyright (C) 2026 Juan Anton Gabriel Resurreccion**; see [COPYRIGHT.md](COPYRIGHT.md).
- Repository remained **private** throughout this work. Main remained `47bea358eb67d122c135ff5364b0afd4156c630b`. Draft PR #72 (`b9d51deab5485a84165f77dec8b6fbf70d50c99b`) and #73 (`2ecb92d75f911b98ae64d151504265794cd38b1c`) remained unmerged and unchanged. No CI, merge, game mutation or deployment was initiated.
- Preparation branch is isolated and not merged.

## Evidence actually inspected
- Enumerated **71 current branch tip trees** via GitHub's recursive tree endpoint (all returned `truncated=false`). No branch tip contained an obvious high-risk *filename* such as `.env`, credential/key files, or a local database matching the applied filename patterns. This is **not a content or deleted-history secrets scan**.
- Inspected main's complete current tree: **891 tracked blob files**, of which **132 are under `docs/evidence/`**. These include local host traces, prompts, console records and audit outputs; the latter require explicit public-data/third-party review.
- Inspected a targeted subset of actual contents from original-main evidence, phone-adapter files on PR #73, repository controls and documentation. The tested samples did not expose an obvious credential signature; **at least one evidence trace contained Notion links**. This does **not** certify all files.
- Examined **100 recent main-branch commit metadata entries**: **65 include Claude session links and associated co-author metadata**. They are additional disclosure metadata if full history becomes public, even if target session contents are permission-protected.
- Found **215 GitHub Actions runs** listed at audit time. Two accessible representative successful job logs were sampled for obvious credential patterns with no match; a failed-run log was unavailable. Logs and artifacts for all 215 runs have **not** been fully inspected.
- Reviewed `.github/workflows/ci.yml`: uses standard `ubuntu-latest` runner, read-only workflow permission, and tests without evident deployment. Reviewed `.gitignore`, `SECURITY.md`, `CONTRIBUTING.md`, the root package manifest, workspace manifests and `pnpm-lock.yaml`.
- Repo includes an existing security test `tests/security/repo-hygiene.test.ts`, which checks current checked-out tracked/untracked text for a short list of secret patterns. It **does not scan Git history, Actions logs or artifacts**. It is not a sufficient basis for publication clearance on its own.
- Direct runtime dependencies in the workspace are principally local workspace packages and `zod`; development dependencies and transitive lock entries are external and retain their own licenses. No comprehensive third-party copyright/code provenance audit was completed.
- `SECURITY.md` currently states the repository is private and directs private reporting to the owner. Public-disclosure wording is required for any public release.

## Unresolved blockers
1. **Historical secrets:** perform a local all-refs Git-history scan with a maintained secrets scanner, and human-review findings, including deleted blobs, branch histories and known credential rotations. This remote connector cannot produce an exhaustive history scan. Review public exposure of Actions logs/artifacts and sensitive issue/PR attachments.
2. **Evidence and metadata:** classify the 132 `docs/evidence/` tracked files and other debug/host traces, Notion links, personal/contributor metadata, and sensitive play/design documents. Decide what is lawful and appropriate to publish. A current-branch deletion alone does not conceal older reachable Git history.
3. **Rights and license scope:** review source and third-party materials, contributor terms and AI-assisted outputs; confirm ownership or legal permission for covered content. Do not assert that a root AGPL text automatically relicenses third-party works, evidence or assets.
4. **Public-release controls:** update public `README`, `SECURITY.md`, `CONTRIBUTING.md` as appropriate. Review branch protections, Actions exposure and PR/issue discussions. No main-repository release or merge is currently authorized by this document.

## Release routes for separate decision
- **Existing repository public:** requires cleared history, all reachable branches, Actions records and disclosure scope. This is the highest-exposure option.
- **New public repository with fresh history:** can limit released history to an explicitly approved snapshot. Requires creating/managing a new remote, publishing only vetted source/docs/tests, and moving genuinely useful CI into that public repository. It does not make the existing private CI free. Retain the original repository private.

**Decision:** HOLD existing-repository publicity pending the unresolved checks. This branch carries only preparatory documents; its existence grants no release, merge, development, design or acceptance authority.
