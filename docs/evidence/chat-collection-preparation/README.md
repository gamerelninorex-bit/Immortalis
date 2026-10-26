# A2 exercised conversation evidence

This directory accompanies the Acceptance and evidence section of [PR #88](https://github.com/gamerelninorex-bit/Immortalis/pull/88). It contains disposable-fixture mechanism evidence: a scripted authenticated MCP host, scripted test-human and scripted referee use the real service, shipped operators, canonical owners and fresh reopen. It does not establish genuine AI interpretation, actual-client/human usability, live onboarding or First Playable acceptance.

The governing [A2-amended Revision 2 brief](https://app.notion.com/p/40420af901e0813ea33ae08b2bc5dedf) is pinned at `2026-10-25T10:19:39.583Z`. Source lock, registers, owners and gates remain unchanged. The original live campaign is never used.

- `transcript-accepted.md` and `transcript-r5.md` show ordinary authored requests, complete mandatory reviews, distinct confirmations, outcomes and next steps from the exercised service path. Their JSON records retain the exact base/executed commits, environment and observed counts.
- `transcript-resumed.md` shows a real service interruption and restart before declaration consent, read-only status, retained input and fresh required consent. Completed stages are not re-authored.
- `measurements.json` records eighteen complete setups: both cycle branches, three unrelated-state/history variants and three repetitions. Every phase, setup, ordinary status and common baseline/current read probe is measured. A missing pre-change end-to-end chat ingress is marked unavailable.
- `recovery-measurements.json` records nine interrupted recoveries across the same unrelated-state/history variants and repetitions. `complete_recovery_ms` and `complete_work` include fresh service startup, scripted OAuth linking, status and retained declaration completion. `restart_and_link_ms`/`restart_and_link_work` and post-link `ms`/`work` distinguish those phases; OAuth decisions stay separate from canonical confirmation.

The causal fixture is a human-authored ORIGINAL courtyard with one finite source of twelve stones, an ordinary one-body character with accepted handling/traversal content, an authored initial coordinate of seven seconds and an empty Reserve. Unrelated variation adds twenty current loci or forty dormant closure-history versions at a separate unused locality through ordinary owners, outside measured setup. The unsupported changed-source-set case and long Unicode reviews have separate regressions; this bounded route does not claim arbitrary source cardinality.

Inherited H-07 canonical reopen/replay, copying, hashing and persistence costs are measured through the common immutable-base/current probe and `open_ms`. Added route checks and orchestration are reported separately. Global filesystem/hash/serialization totals include scripted referee polling. Transport totals count OAuth/MCP and elicitation HTTP traffic. Host-visible allowlisted text is distinct from internal serialized result size. These measurements establish no model latency, token cost or client UX; they are not machine-specific timing thresholds.

The transcript's automatic-finish annotation describes service/referee work with no additional human decision. The `requests` count includes that scripted initiation; canonical human confirmations and OAuth linking are counted separately.

Use Node `22.22.2`, pnpm `10.33.0`, full Git history including base `e8fd50b3de6f4f0f1e7be71fa97ff3b5434ea587`, and a disposable environment permitting loopback:

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run tests/integration/chat-collection-prep*.test.ts
pnpm run ci
node --experimental-strip-types tools/extract-a2-evidence.ts downloaded-job.log evidence-output
```

The extractor validates all five complete record sets before writing files and redacts human-only one-time test challenges. CI emits fresh exact-HEAD records on every run. Committed artifacts identify their executed snapshot explicitly; the PR records final exact-HEAD CI and any artifact-only delta. No earlier run or artifact self-clears BLUE review.

The records accompanying this delivery were executed at `26ea9aba9d18a7e00eb3933d0dc0d9209288cfbb` in [the A2 evidence stage](https://github.com/gamerelninorex-bit/Immortalis/actions/runs/40250377058). Later commits add documentation and these records; final exact-HEAD CI is recorded separately in the PR. An intermediate workflow superseded by an evidence commit is not a full-suite pass.

The measurements found and prompted a bounded transport repair: closing a terminal with no pending prompt now wakes existing long-poll callers after owner readback. Previously an R-5 call could wait out its ten-second poll even though work had finished. A fake-timer unit regression verifies completion notification without a new line, prompt or elapsed wait. The PR compares the observed earlier run with the new measurements; H-07 persistence is unchanged.

The BLUE PR88 H1 repair removes numeric-text inference from branch eligibility. Before preparation, status leaves the branch open and offers preparation with `if_handling_duration_unresolved`; actual accepted cycle words need no additional R-5 question. The existing classifier judges a proposed clarification against the accepted baseline, and existing owner attestation still judges actual cycle meaning before an act. An unrelated breath-holding duration is exercised through the real service/classifier/owner; an already-stated reading rejects before another human acceptance. These remain scripted mechanism regressions.

Actual named-client/human setup, separately chosen collection and interruption/resumption remain BLUE's next authorized milestone on existing OB-030 and the Master Roadmap, including Android ChatGPT where available. Release stays BLOCKED; OB-058 stays CLOSED. No deployment, paid API, live campaign mutation or H-07 persistence repair is included.
