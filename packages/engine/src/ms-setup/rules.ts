import type { SourceRef } from "@immortalis/contracts";

/** Literal manifest: https://app.notion.com/p/41320af901e081d885d5f047b4e0b8bb @ 2026-11-09T00:43:08.394Z. */
export const MS_SOURCE = {
  artifact: "https://app.notion.com/p/41320af901e081d885d5f047b4e0b8bb",
  native_pin: "2026-11-09T00:43:08.394Z",
} as const;
export const MS_AUTHORITY_LINEAGE: readonly string[] = [
  "F-027 v1.0 — https://app.notion.com/p/3ea20af901e081bc9c55d2c5a49cf639 @ 2026-09-29T00:40:44.707Z; original frozen sources preserved",
  "M-S v0.8 A–D DESIGN ratification — https://app.notion.com/p/41220af901e0810687b3c2ae39c69701 @ 2026-11-08T23:36:18.355Z; no unwritten technical encoding adopted by that record",
  "M-S v0.8 semantic candidate — https://app.notion.com/p/41120af901e081eca8d7f16a5c5d51d8 @ 2026-11-07T02:37:17.218Z; nonconflicting v0.7/v0.6/v0.5/v0.4 inherited only as scoped there",
  "Initial Locality Bootstrap v0.9 semantic source — https://app.notion.com/p/40b20af901e081069bb7ce5118a047b1 @ 2026-11-01T12:13:42.692Z; CORE_V9 and OPTION_A_V9 compose outside the exact MS alternatives",
  "Initial Locality Bootstrap v0.9 executable contract — https://app.notion.com/p/40b20af901e08198abdacb340e3507df @ 2026-11-01T12:13:53.634Z; legacy rules unchanged",
  "C1/C2 v0.4 — https://app.notion.com/p/40d20af901e081309889e8333d2a9286 @ 2026-11-03T00:51:23.053Z; V9 hash meanings unchanged, actor-only profile separately namespaced",
  "R1 Stage-One v1.1 — https://app.notion.com/p/3e120af901e081ec9de8fea870221a0d @ 2026-10-23T09:27:39.157Z; MS-only placement/closure/presence alternatives",
  "S1-P1 composing source — https://app.notion.com/p/3e120af901e081ec9de8fea870221a0d @ 2026-10-23T12:26:49.599Z; original acoustic callers and eligibility remain unchanged",
  "Canonical Role Registry — https://app.notion.com/p/3e620af901e081f68ff1d0cc574e041a @ 2026-09-25T08:21:22.816Z; role.world/permission.world_process.resolve isolated author and role.archivist/permission.canon.write owner-admitted publication",
  "F-014A v3.3 — https://app.notion.com/p/3e520af901e081619a59c069a36db420 @ 2026-09-25T00:18:36.828Z; no capability, cognition or rights expansion",
  "WS-016 integration map — https://app.notion.com/p/3e220af901e08168b37ccee101d23e49 @ 2026-09-24T17:38:59.210Z; shared capability and PC compilation consumers not widened",
];
const rule = (clause: string): SourceRef => ({
  ...MS_SOURCE,
  clause,
  authority_lineage: [...MS_AUTHORITY_LINEAGE],
  effective_basis: "pinned-by-spec-lock",
  supersedes: null,
});
export const INITIAL_SETUP_INPUT_MS_V3_RULE = rule("INITIAL_SETUP_INPUT_MS_V3_RULE");
export const INITIAL_LOCALITY_COMPLETION_MS_V3_RULE = rule(
  "INITIAL_LOCALITY_COMPLETION_MS_V3_RULE",
);
export const MS_ACTOR_SETUP_ISSUE_V1_RULE = rule("MS_ACTOR_SETUP_ISSUE_V1_RULE");
export const MS_ACTOR_SETUP_RESPONSE_V1_RULE = rule("MS_ACTOR_SETUP_RESPONSE_V1_RULE");
export const MS_NAMED_ACTOR_EXISTENCE_V1_RULE = rule("MS_NAMED_ACTOR_EXISTENCE_V1_RULE");
export const MS_R1_PLACEMENT_V1_RULE = rule("MS_R1_PLACEMENT_V1_RULE");
export const MS_R1_CLOSURE_V1_RULE = rule("MS_R1_CLOSURE_V1_RULE");
export const MS_R1_PRESENCE_V1_RULE = rule("MS_R1_PRESENCE_V1_RULE");
export const MS_CAPTURED_CHRONOLOGY_PRECONDITION_V1 = rule(
  "MS_CAPTURED_CHRONOLOGY_PRECONDITION_V1",
);
export const MS_SETUP_PHASE_FENCE_V1 = rule("MS_SETUP_PHASE_FENCE_V1");
export const MS_HISTORY_POLICY_SUFFIX = "+MS-SETUP-V08@2026-11-09T00:43:08.394Z+MS_ACTOR_PARSER_V1";
