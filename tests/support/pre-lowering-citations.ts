import type { SourceRef } from "@immortalis/contracts";

/**
 * TEST-ONLY DATA. The exact whole governing citations that `world_pc_current_viewing` and the `GM_SCENE_RESOLUTION` value class of
 * `referee_decision` carried at PR #94 head 853f2da (before the F-027 v0.8 current-look lowerings were source-locked), as literals.
 * They exist so that a test can show that a history carrying them is refused (admission of a new write; load of an old journal).
 * They are deliberately NOT exported from any packages/* production module: production code has no legacy reader, no read-either
 * acceptance and no cutover marker, and cannot name them. Each is pinned by SHA-256 of its JSON text so this data cannot drift.
 */
export const PRE_LOWERING_VIEWING_RULE_SHA256 =
  "c58fa3ddfcc2efc42a080d41dae26e9512ef2576545e4439841ce5d66b69eaf9";
export const PRE_LOWERING_SCENE_RULE_SHA256 =
  "e00e6ca367a4061f33cca39bdab9aca64f621eeb69fd29efae8e8794cb397cfc";

export const PRE_LOWERING_VIEWING_RULE: SourceRef = {
  artifact: "https://app.notion.com/p/3e120af901e081ec9de8fea870221a0d",
  native_pin: "2026-09-25T13:44:22.668Z",
  clause:
    "Ownership Guards - World Generation May Own: world-side environmental, geographic, topological and other general world-state facts not owned by a more specific subsystem, and F-016 Ratified Fallback Objective Physical-Entity Custody (World-State is the fallback custodian of objective physical/entity facts only where no more-specific authoritative owner exists for the exact fact); with I-002 4.3 (position, local physical condition and other world-locus differences are runtime physical state, not intrinsic PC state)",
  authority_lineage: [
    "F-027 v1.0 spec-lock (spec/f027/spec-lock.json) frozen-source pin",
    "Sovereign-ratified within W3-CP3 / OB-044, 2026-09-25 (https://app.notion.com/p/3e620af901e0818a8c85cee779263a2c)",
    'BLUE Bounded Construction Brief - GM-led Natural First-Play Rebuild, verified native pin 2026-10-30T03:34:44.575Z (https://app.notion.com/p/40920af901e081088cccd3c7eaa995aa), cited as the construction objective and acceptance boundary only (NOT a game-design source, NOT an amendment to any frozen owner contract, NOT a spec-lock pin), with the Operating Charter section "30 October 2026 - Standing construction requirement: GM-led natural chat play" (native pin 2026-10-30T03:16:44.156Z, https://app.notion.com/p/3ea20af901e0819a88b2c490ab874acc) and I-001 section 8 (https://app.notion.com/p/3e220af901e081c6b0f2edcfefe9e4d2, native pin 2026-09-25T00:17:49.551Z); the quotation of World Generation\'s Resolution Rules and F-016 fallback was read from the page as edited 2026-10-23T12:26:49.599Z and its equivalence at the frozen pin is NOT independently verified',
    "F-016 Integrated Review Candidate v0.4 manifest, pin 2026-09-25T13:48:12.575Z (https://app.notion.com/p/3e620af901e0812bb807d234d88fadb6): conformed Production durable-completion and World-State fallback-custodian guards",
    "F-027 Runtime Contract & Translation Tranche v0.2 §5.2 rule 6 and §4 lowering set, pin 2026-09-29T00:33:04.009Z (https://app.notion.com/p/3ea20af901e081b8b958f7f3f39cb96a)",
  ],
  effective_basis: "pinned-by-spec-lock",
  supersedes: null,
};

export const PRE_LOWERING_SCENE_RULE: SourceRef = {
  artifact: "https://app.notion.com/p/40920af901e081088cccd3c7eaa995aa",
  native_pin: "2026-10-30T03:34:44.575Z",
  clause:
    "Decision 1 (the GM rules, through the existing provider-neutral referee pattern, whether an ORDINARY look is physically supported at one basis, distinguishing ordinary implied means from a materially new commitment and respecting established vetoes; the interpretation is anchored to verbatim quotations of delivered premises, the engine validates and derives the verdict, and the retained record is create-only RC-09/IM-12 provenance, never a physical-truth or knowledge ledger)",
  authority_lineage: [
    "BLUE B61-A3 No-Paid-API Host-Driven AI Referee Construction Brief, pin 2026-10-11T02:46:54.896Z (https://app.notion.com/p/3f620af901e081c7a044eddf02503ec3) under the Sovereign Option B approvals (https://app.notion.com/p/3f620af901e081faaf00da0cc6e4068b, 2026-10-11T02:31:00.727Z; https://app.notion.com/p/3f620af901e081ddb9b5e6d4f9ff080b, 2026-10-11T02:44:51.553Z); frozen I-002 Player Character Generation Working Operational Draft v2 §§2.1, 6, 7, 21 pin 2026-09-25T00:15:54.536Z (https://app.notion.com/p/5a520af901e0829eadb201bccd6c4718); Player-World Insertion & Reconciliation Working Operational Draft v1 §§3, 5, 7, 9, 18 pin 2026-09-25T00:17:26.287Z (https://app.notion.com/p/3e320af901e081a3a669c1c0b842c9df); Canonical Role Registry v1 role.gm + permission.rule.adjudicate pin 2026-09-25T08:21:22.816Z (https://app.notion.com/p/3e620af901e081f68ff1d0cc574e041a)",
    'BLUE Bounded Construction Brief - GM-led Natural First-Play Rebuild, verified native pin 2026-10-30T03:34:44.575Z (https://app.notion.com/p/40920af901e081088cccd3c7eaa995aa), cited as the construction objective and acceptance boundary only (NOT a game-design source, NOT an amendment to any frozen owner contract, NOT a spec-lock pin), with the Operating Charter section "30 October 2026 - Standing construction requirement: GM-led natural chat play" (native pin 2026-10-30T03:16:44.156Z, https://app.notion.com/p/3ea20af901e0819a88b2c490ab874acc) and I-001 section 8 (https://app.notion.com/p/3e220af901e081c6b0f2edcfefe9e4d2, native pin 2026-09-25T00:17:49.551Z); the quotation of World Generation\'s Resolution Rules and F-016 fallback was read from the page as edited 2026-10-23T12:26:49.599Z and its equivalence at the frozen pin is NOT independently verified',
    "F-027 Runtime Contract & Translation Tranche v0.2 §5.2 rule 6 and §4 lowering set, pin 2026-09-29T00:33:04.009Z (https://app.notion.com/p/3ea20af901e081b8b958f7f3f39cb96a)",
  ],
  effective_basis: "blue-bounded-brief-not-spec-locked",
  supersedes: null,
};
