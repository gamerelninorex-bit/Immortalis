import {
  CHECKLIST,
  PRODUCER_INPUT_MAX_BYTES,
  canonicalJson,
  fail,
  ok,
  type InitialSetupInput,
  type Pin,
  type Result,
  type ScopeOutput,
  type SetupPhase,
} from "@immortalis/contracts";
import type { ProjectedFact } from "./genesis.ts";
import { sha256Bytes, taskIdOf } from "./identity.ts";

/**
 * The fixed, engine-owned producer inputs of the two isolated operations (companion "Scope and Total Inputs" and "Selection and
 * Chronology Checks"). Nothing but the Input record, the total whitelisted genesis projection and (for SCENE) the accepted scope
 * enters them: no later goal, outcome preference, chat transcript, personal memory, refused-session text or extra retrieval. The
 * adapter passes the bytes unchanged.
 *
 * OPEN INTERPRETATION (reported to BLUE, not silently chosen): as literally written, `task_id = SHA256({campaign_id, setup_id, phase,
 * input, input_hash})` while the producer input itself lists `task_id`; if `input_hash` hashed those very bytes the definition would be
 * circular. Here `input_hash` is the SHA-256 of the exact canonical producer-input bytes WITHOUT the `task_id` member, `task_id` is
 * derived from it by the companion's formula, and the delivered bytes are the companion's exact field set (with `task_id`). Both the
 * identity and the delivered object are therefore pure functions of the canonical Input, the projection and the accepted scope.
 */
export const SCOPE_INPUT_FORMAT = "immortalis-initial-scope-input";
export const SCENE_INPUT_FORMAT = "immortalis-initial-scene-input";

export interface ProducerInputArgs {
  readonly campaign_id: string;
  readonly phase: SetupPhase;
  readonly input_pin: Pin;
  readonly input: InitialSetupInput;
  readonly genesis: readonly ProjectedFact[];
  /** SCENE only: the accepted Grant pin and the accepted full scope. */
  readonly grant?: Pin;
  readonly scope?: ScopeOutput;
}

export interface ProducerInput {
  readonly task_id: string;
  readonly input_hash: string;
  /** the exact bytes handed to the isolated runner */
  readonly bytes: Uint8Array;
}

export type ProducerInputErrorCode = "PRODUCER_INPUT_OVERSIZE" | "PRODUCER_INPUT_INCOMPLETE";

export function buildProducerInput(
  a: ProducerInputArgs,
): Result<ProducerInput, ProducerInputErrorCode> {
  const common = {
    format_version: 1,
    input: a.input_pin,
    projection_hash: a.input.projection_hash,
    genesis: a.genesis,
    setup_message: a.input.setup_message,
    chronology: a.input.chronology.document,
    checklist: [...CHECKLIST],
  };
  let base: Record<string, unknown>;
  if (a.phase === "SCOPE") {
    base = { format: SCOPE_INPUT_FORMAT, ...common };
  } else {
    if (!a.grant || !a.scope)
      return fail("PRODUCER_INPUT_INCOMPLETE", "a SCENE input needs its accepted grant and scope");
    base = { format: SCENE_INPUT_FORMAT, ...common, grant: a.grant, scope: a.scope };
  }
  const input_hash = sha256Bytes(Buffer.from(canonicalJson(base), "utf8"));
  const task_id = taskIdOf({
    campaign_id: a.campaign_id,
    setup_id: a.input.setup_id,
    phase: a.phase,
    input: a.input_pin,
    input_hash,
  });
  const bytes = Buffer.from(canonicalJson({ ...base, task_id }), "utf8");
  if (bytes.length > PRODUCER_INPUT_MAX_BYTES)
    return fail(
      "PRODUCER_INPUT_OVERSIZE",
      `the producer input exceeds ${PRODUCER_INPUT_MAX_BYTES} bytes; an oversize source is an explicit transport limit, never truncated`,
    );
  return ok({ task_id, input_hash, bytes });
}

/** The hash of delivered producer-input bytes is over their canonical JSON WITHOUT the `task_id` member (see the interpretation note). */
export function inputHashOfDelivered(bytes: Uint8Array): string {
  const obj = JSON.parse(Buffer.from(bytes).toString("utf8")) as Record<string, unknown>;
  delete obj["task_id"];
  return sha256Bytes(Buffer.from(canonicalJson(obj), "utf8"));
}

/**
 * The fixed, engine-owned instructions of the two isolated operations. They state the OUTPUT CONTRACT only — no game rule, no
 * tool, no memory, no transcript. They are pinned into the runner (`instruction_hash`) at trusted startup, so a goal-aware
 * substitution changes the pin. The isolated context receives these instructions and the exact producer-input bytes, nothing else.
 */
export const INITIAL_SETUP_INSTRUCTIONS = {
  SCOPE:
    "You classify one authentic setup message for a fresh original locality. Read ONLY the JSON input. Answer with ONE JSON object of kind SCOPE: copy task_id and input_hash from the dispatch header; set message_use to SETUP_AUTHORSHIP_ONLY, MIXED_INPUT (the message also commands an act now) or UNCLEAR; list the four checklist facets once each in the given order with mode DELEGATED, FIXED_BY_SOURCE or NOT_AUTHORIZED, with exact evidence quotes and source refs; list only the closed normalized restrictions the message states, each with its exact quote; list unhandled_constraints and any clarification. Quote exactly. Invent nothing.",
  SCENE:
    "You select the initial scene for a fresh original locality under the accepted scope. Read ONLY the JSON input. Answer with ONE JSON object of kind SELECTION (task_id and input_hash copied from the dispatch header, then the strict selection) or kind UNRESOLVED with a reason. Choose only what the accepted scope delegates; keep every fixed value; give every selected leaf its provenance. Quote exactly. Invent nothing.",
} as const;

export const instructionHashOf = (): string =>
  sha256Bytes(
    Buffer.from(
      canonicalJson({
        SCOPE: INITIAL_SETUP_INSTRUCTIONS.SCOPE,
        SCENE: INITIAL_SETUP_INSTRUCTIONS.SCENE,
      }),
      "utf8",
    ),
  );
