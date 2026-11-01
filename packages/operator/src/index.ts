// @immortalis/operator — the bounded local trusted PC command-and-reopen mechanism.
// A local operator (an operating-system user who owns the chosen campaign package) opens one campaign in a session, makes the two
// distinct player choices of one post-handover active-PC single-leg relocation — each with its own explicit console confirmation —
// through the EXISTING strict host-protocol gateways, closes, and reopens the same campaign to reconcile or continue by the
// original identities. No remote authentication, interpreter, game rule, narration or owner is added here.
// OUT-OF-CHARACTER development/scenario instrumentation: the delivery boundary is an operator-declared scenario premise, not a
// travel-time choice (see ooc.ts).
export {
  additionalLocalityId,
  establishAdditionalLocality,
  readAdditionalLocalityFile,
} from "./additional-locality.ts";
export type {
  AdditionalLocalityResult,
  AdditionalLocalityStatus,
  EstablishAdditionalLocalityParams,
  LocalityFileErrorCode,
} from "./additional-locality.ts";
export { corridorId, establishCorridor, readCorridorFile } from "./corridor.ts";
export type {
  CorridorFileErrorCode,
  CorridorResult,
  CorridorStatus,
  EstablishCorridorParams,
} from "./corridor.ts";
export {
  additionalSourceId,
  establishAdditionalSource,
  readAdditionalSourceFile,
} from "./additional-source.ts";
export type {
  AdditionalSourceResult,
  AdditionalSourceStatus,
  EstablishAdditionalSourceParams,
  SourceFileErrorCode,
} from "./additional-source.ts";
export {
  establishInitialLocalDemand,
  expectedDemand,
  expectedRequest,
  expectedStart,
  initialLocalDemandId,
  readInitialLocalDemandFile,
} from "./initial-local-demand.ts";
export type {
  EstablishInitialLocalDemandParams,
  InitialLocalDemandResult,
  InitialLocalDemandStatus,
  ProcessFileErrorCode,
} from "./initial-local-demand.ts";
export {
  establishInitialPopulation,
  expectedCohort,
  expectedLedger,
  initialPopulationId,
  readInitialPopulationFile,
} from "./initial-population.ts";
export type {
  EstablishInitialPopulationParams,
  InitialPopulationResult,
  InitialPopulationStatus,
  PopulationFileErrorCode,
} from "./initial-population.ts";
export {
  establishInitialTimedGovernance,
  expectedEnrollment,
  initialTimedGovernanceId,
  readInitialTimedGovernanceFile,
} from "./initial-timed-governance.ts";
export type {
  EstablishInitialTimedGovernanceParams,
  GovernanceFileErrorCode,
  InitialTimedGovernanceResult,
  InitialTimedGovernanceStatus,
} from "./initial-timed-governance.ts";
export {
  establishProductionReserve,
  expectedReserve,
  productionReserveId,
  readProductionReserveFile,
} from "./production-reserve.ts";
export type {
  EstablishProductionReserveParams,
  ProductionReserveResult,
  ProductionReserveStatus,
  ReserveFileErrorCode,
} from "./production-reserve.ts";
export * from "./cli.ts";
export * from "./commands.ts";
export * from "./closed-setting.ts";
export * from "./collection-referee.ts";
export * from "./collection-preparation.ts";
export * from "./collection-clarification.ts";
export * from "./collection-delegation.ts";
export {
  consumeConfirmation,
  requestOperatorConfirmation,
  requestOperatorDecision,
  subjectOf,
} from "./confirmation.ts";
export type { ConfirmationVerb, OperatorConfirmation, OperatorDecision } from "./confirmation.ts";
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
export * from "./referee-console.ts";
export * from "./referee-session.ts";
export * from "./session.ts";
export * from "./terminal.ts";
export * from "./time-initialization.ts";
