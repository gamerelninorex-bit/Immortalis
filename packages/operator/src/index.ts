// @immortalis/operator — the bounded local trusted PC command-and-reopen mechanism.
// A local operator (an operating-system user who owns the chosen campaign package) opens one campaign in a session, makes the two
// distinct player choices of one post-handover active-PC single-leg relocation — each with its own explicit console confirmation —
// through the EXISTING strict host-protocol gateways, closes, and reopens the same campaign to reconcile or continue by the
// original identities. No remote authentication, interpreter, game rule, narration or owner is added here.
// OUT-OF-CHARACTER development/scenario instrumentation: the delivery boundary is an operator-declared scenario premise, not a
// travel-time choice (see ooc.ts).
export * from "./additional-source.ts";
export * from "./cli.ts";
export * from "./commands.ts";
export * from "./confirmation.ts";
export * from "./ledger.ts";
export * from "./locality.ts";
export * from "./local-operator.ts";
export * from "./ooc.ts";
export * from "./observation.ts";
export * from "./original-pc-locus.ts";
// the shared internals the original-pc modules use between them (result helper, session opener, identity helpers) stay module-private
export {
  DELEGATION_NONE_TEXT,
  EMPTY_DRAFT,
  MAX_LIST_ITEMS,
  MAX_STATEMENT_CHARS,
  WORLD_CLAIMS_NONE_TEXT,
  applyEdits,
  authorCharacter,
  bindingIdOf,
  characterStatus,
  compileContract,
  findingsLines,
  judgeStatement,
  mirrorItems,
  mirrorPanel,
  missingOf,
  parseEdit,
  releaseEvidenceProblems,
  releaseIdOf,
  releaseProblems,
} from "./original-pc.ts";
export type {
  AuthorCharacterParams,
  ChainReader,
  CharacterDraft,
  CharacterResult,
  CharacterStatus,
  ContactDraft,
  Edit,
  InsertionPins,
  MirrorItem,
  MirrorSection,
  RefereeKeepEvidence,
} from "./original-pc.ts";
export * from "./referee-exchange.ts";
export * from "./referee-mcp.ts";
export * from "./referee-session.ts";
export * from "./session.ts";
export * from "./terminal.ts";
