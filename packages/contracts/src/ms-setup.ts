import { z } from "zod";
import { Id, Sha256 } from "./ids.ts";
import { PinSchema, UNRESOLVED_REASONS_V9 } from "./initial-locality.ts";
import { EntityId, Text } from "./world-foundation.ts";

/** M-S v0.8 executable companion v0.3, §§2–4. No existing bootstrap schema is widened. */
export const MS_ACTOR_PARSER_V1 = "MS_ACTOR_PARSER_V1" as const;
export const MS_ACTOR_RUNNER_ID = "ms-initial-actor-runner-v1" as const;
export const FACET_WORLD_INITIAL_ACTOR_SETUP = "world_initial_actor_setup" as const;
export const FACET_ACTOR_EXISTENCE = "actor_existence" as const;
export const MS_FACT_KIND_IDS = [
  "initial_actor_setup_issue",
  "initial_actor_setup_response",
  "named_actor_existence_basis",
] as const;
export const MS_CONSTRAINT_PATH = "actors.constraints[0]" as const;
export const msActorRoot = (world: string, locus: string, digest: string): string =>
  `world/${world}/locus/${locus}/initial-actor/${digest}`;
export const msActorIssueKey = (world: string, locus: string, digest: string): string =>
  `${msActorRoot(world, locus, digest)}/issue`;
export const msActorResponseKey = (world: string, locus: string, digest: string): string =>
  `${msActorRoot(world, locus, digest)}/response`;
export const namedActorExistenceBasisKey = (actor: string): string =>
  `named-actor/${actor}/existence-basis`;

export const MsActorRunnerSchema = z.strictObject({
  runner_id: z.literal(MS_ACTOR_RUNNER_ID),
  key_id: Id,
  public_key: Text,
  instruction_hash: Sha256,
  driver_id: Id,
  driver_config_hash: Sha256,
});
export const InitialActorSetupIssueSchema = z.strictObject({
  world_id: EntityId,
  locus_id: EntityId,
  setup_id: Sha256,
  completion: PinSchema,
  input: PinSchema,
  grant: PinSchema,
  completion_digest: Sha256,
  constraint_index: z.literal(0),
  constraint_path: z.literal(MS_CONSTRAINT_PATH),
  leaf_sha256: Sha256,
  task_id: Sha256,
  input_hash: Sha256,
  parser: z.literal(MS_ACTOR_PARSER_V1),
  runner: MsActorRunnerSchema,
});
export type InitialActorSetupIssue = z.infer<typeof InitialActorSetupIssueSchema>;
export const ActorEnvelopeBodySchema = z.strictObject({
  format: z.literal("immortalis-ms-actor-runner-result"),
  format_version: z.literal(1),
  runner_id: z.literal(MS_ACTOR_RUNNER_ID),
  key_id: Id,
  campaign_id: Id,
  world_id: EntityId,
  locus_id: EntityId,
  setup_id: Sha256,
  phase: z.literal("ACTOR"),
  task_id: Sha256,
  reservation: PinSchema,
  completion: PinSchema,
  input_hash: Sha256,
  instruction_hash: Sha256,
  driver_id: Id,
  driver_config_hash: Sha256,
  context_manifest_hash: Sha256,
  parser: z.literal(MS_ACTOR_PARSER_V1),
  raw_response_hash: Sha256,
});
export type ActorEnvelopeBody = z.infer<typeof ActorEnvelopeBodySchema>;
export const ActorSignedEnvelopeSchema = z.strictObject({
  body: ActorEnvelopeBodySchema,
  signature: Text,
});
export type ActorSignedEnvelope = z.infer<typeof ActorSignedEnvelopeSchema>;
/** Empty is canonical raw base64; qualification checks exact spelling and transport bounds. */
export const RawActorBase64 = z.string();
export const InitialActorSetupResponseSchema = z.strictObject({
  world_id: EntityId,
  locus_id: EntityId,
  setup_id: Sha256,
  completion: PinSchema,
  issue: PinSchema,
  task_id: Sha256,
  input_hash: Sha256,
  parser: z.literal(MS_ACTOR_PARSER_V1),
  raw_response_base64: RawActorBase64,
  raw_response_hash: Sha256,
  envelope: ActorSignedEnvelopeSchema,
});
export type InitialActorSetupResponse = z.infer<typeof InitialActorSetupResponseSchema>;
export const NamedActorExistenceBasisSchema = z.strictObject({
  actor_id: EntityId,
  kind: z.literal("NON_PC_NAMED_ACTOR"),
  origin: z.strictObject({
    world: PinSchema,
    locus: PinSchema,
    completion: PinSchema,
    author_response: PinSchema,
  }),
  origin_licence: z.strictObject({
    completion: PinSchema,
    constraint_index: z.literal(0),
    constraint_path: z.literal(MS_CONSTRAINT_PATH),
    leaf_sha256: Sha256,
    input: PinSchema,
    grant: PinSchema,
  }),
  source_proof: z.strictObject({ issue: PinSchema, proof_hash: Sha256 }),
});
export type NamedActorExistenceBasis = z.infer<typeof NamedActorExistenceBasisSchema>;
export const MsActorOutputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("CONFIRM_INDEX"),
    task_id: Sha256,
    constraint_index: z.literal(0),
  }),
  z.strictObject({
    kind: z.literal("UNRESOLVED"),
    task_id: Sha256,
    reason: z.enum(UNRESOLVED_REASONS_V9),
  }),
]);
