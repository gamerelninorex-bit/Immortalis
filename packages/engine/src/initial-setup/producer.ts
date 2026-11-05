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
 * IDENTITY (C-1, Sovereign-ratified clarification v0.4; formerly an open interpretation): let P be the companion's complete producer object
 * with only its `task_id` member omitted. Then
 *   H = SHA256(UTF8(canonicalJson(P)))                                                  (`input_hash`: the pre-task content hash)
 *   T = SHA256(UTF8(canonicalJson({campaign_id, setup_id, phase, input, input_hash: H})))   (`task_id`)
 *   D = UTF8(canonicalJson({...P, task_id: T}))                                         (the bytes the isolated context receives)
 * `input_hash` is H, never the hash of D. Trusted construction, admission and historical verification rebuild P, H, T and D
 * independently; the bytes delivered to the runner must be BYTE-EQUAL to D (re-canonicalizing supplied bytes is not enough). The model
 * copies only `task_id`; no input-hash header or other context channel exists.
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

/**
 * The byte-equality check of C-1: are the bytes about to be delivered EXACTLY D for this (campaign, session, phase, Input pin, H, T)?
 * It decodes strictly, rebuilds P/H/T/D from the bytes' own content and compares lengths and actual bytes, so a whitespace or key-order
 * variant of the same parsed object is NOT an eligible delivery. Returns a reason, or null when the bytes are exactly D.
 */
export function deliveredProducerBytesViolation(
  bytes: Uint8Array,
  expected: {
    readonly campaign_id: string;
    readonly setup_id: string;
    readonly phase: SetupPhase;
    readonly input: Pin;
    readonly task_id: string;
    readonly input_hash: string;
  },
): string | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "the producer input is not valid UTF-8";
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "the producer input is not valid JSON";
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    return "the producer input is not a JSON object";
  const { task_id: echoed, ...p } = parsed as Record<string, unknown>;
  const h = sha256Bytes(Buffer.from(canonicalJson(p), "utf8"));
  const t = taskIdOf({
    campaign_id: expected.campaign_id,
    setup_id: expected.setup_id,
    phase: expected.phase,
    input: expected.input,
    input_hash: h,
  });
  if (h !== expected.input_hash)
    return "the producer input's pre-task hash is not the reservation's";
  if (t !== expected.task_id || echoed !== t)
    return "the producer input's task identity is not the reservation's";
  if (canonicalJson(p["input"]) !== canonicalJson(expected.input))
    return "the producer input names another Input pin";
  const d = Buffer.from(canonicalJson({ ...p, task_id: t }), "utf8");
  if (d.length !== bytes.length || Buffer.compare(d, Buffer.from(bytes)) !== 0)
    return "the delivered bytes are not the exact canonical bytes D";
  return null;
}

/** context_manifest_hash = SHA256(canonicalJson({instructions: exact phase string, producer_input_sha: SHA256(D)})). */
export const contextManifestHashOf = (instructions: string, producerInput: Uint8Array): string =>
  sha256Bytes(
    Buffer.from(
      canonicalJson({ instructions, producer_input_sha: sha256Bytes(producerInput) }),
      "utf8",
    ),
  );

/**
 * The fixed, engine-owned instructions of the two isolated operations. They state the OUTPUT CONTRACT only - no game rule, no
 * tool, no memory, no transcript. Each COMPLETE map is pinned into the runner (`instruction_hash`) at trusted startup, so a goal-aware
 * substitution changes the pin, and is retained in the IMMUTABLE registry below keyed by that hash: replay resolves the exact historical
 * strings from it and never substitutes a current mutable string. The isolated context receives the phase string and the exact producer
 * input D, nothing else.
 */
export interface InstructionMap {
  readonly SCOPE: string;
  readonly SCENE: string;
}

/** FROZEN with parser V1: fixture history only (the model echoed `input_hash` from a "dispatch header" no channel carries). */
export const INSTRUCTIONS_V1: InstructionMap = Object.freeze({
  SCOPE:
    "You classify one authentic setup message for a fresh original locality. Read ONLY the JSON input. Answer with ONE JSON object of kind SCOPE: copy task_id and input_hash from the dispatch header; set message_use to SETUP_AUTHORSHIP_ONLY, MIXED_INPUT (the message also commands an act now) or UNCLEAR; list the four checklist facets once each in the given order with mode DELEGATED, FIXED_BY_SOURCE or NOT_AUTHORIZED, with exact evidence quotes and source refs; list only the closed normalized restrictions the message states, each with its exact quote; list unhandled_constraints and any clarification. Quote exactly. Invent nothing.",
  SCENE:
    "You select the initial scene for a fresh original locality under the accepted scope. Read ONLY the JSON input. Answer with ONE JSON object of kind SELECTION (task_id and input_hash copied from the dispatch header, then the strict selection) or kind UNRESOLVED with a reason. Choose only what the accepted scope delegates; keep every fixed value; give every selected leaf its provenance. Quote exactly. Invent nothing.",
});

/** CURRENT (parser V2, provenance profile V1): copy `task_id` from the input object only; the selected-leaf path set is closed and indexed. */
export const INSTRUCTIONS_V2: InstructionMap = Object.freeze({
  SCOPE:
    "You classify one authentic setup message for a fresh original locality. Read ONLY the JSON input. Answer with ONE JSON object of kind SCOPE: copy task_id exactly from the input object and output no input_hash; set message_use to SETUP_AUTHORSHIP_ONLY, MIXED_INPUT (the message also commands an act now) or UNCLEAR; list the four checklist facets once each in the given order with mode DELEGATED, FIXED_BY_SOURCE or NOT_AUTHORIZED, with exact evidence quotes and source refs; list only the closed normalized restrictions the message states, each with its exact quote; list unhandled_constraints and any clarification. Quote exactly. Invent nothing.",
  SCENE:
    "You select the initial scene for a fresh original locality under the accepted scope. Read ONLY the JSON input. Answer with ONE JSON object of kind SELECTION (task_id copied exactly from the input object, no input_hash, then the strict selection) or kind UNRESOLVED with a reason. Choose only what the accepted scope delegates; keep every fixed value equal to its source value. Give exactly one provenance entry to each of these paths, in any order: domain.designation, domain.topology, closure.kind, closure.ground, actors.kind, actors.ground, actors.constraints[i] for each constraint (zero-based decimal index, no leading zeroes), source_claims[0].kind, source_claims[0].ground, source_claims[0].claimant only when it is non-null, workforce.scope_statement, coverage.start, coverage.end and coverage.ground. Use PLAYER_AUTHORED only for text that occurs verbatim in the entry's own evidence quotes or equals a string value of a source fact the entry cites, and PLAYER_DELEGATED with the accepted grant otherwise; coverage.start is PLAYER_AUTHORED with the captured chronology statement as its only quote. Quote exactly. Invent nothing.",
});

export const instructionMapHash = (m: InstructionMap): string =>
  sha256Bytes(Buffer.from(canonicalJson({ SCOPE: m.SCOPE, SCENE: m.SCENE }), "utf8"));

export interface InstructionRegistration {
  readonly parser: "INITIAL_LOCALITY_PARSER_V1" | "INITIAL_LOCALITY_PARSER_V2";
  readonly map: InstructionMap;
}
/** The immutable, version-pinned registry keyed by instruction_hash. Both complete maps are stored; neither is ever edited in place. */
const REGISTRY: ReadonlyMap<string, InstructionRegistration> = new Map<
  string,
  InstructionRegistration
>([
  [
    instructionMapHash(INSTRUCTIONS_V1),
    { parser: "INITIAL_LOCALITY_PARSER_V1", map: INSTRUCTIONS_V1 },
  ],
  [
    instructionMapHash(INSTRUCTIONS_V2),
    { parser: "INITIAL_LOCALITY_PARSER_V2", map: INSTRUCTIONS_V2 },
  ],
]);

/**
 * Resolves the historical instruction map of an `instruction_hash`. The complete stored map is RE-HASHED with the original hash
 * function and a missing or mismatched entry is refused: a caller must fail closed (never treat it as a proved mismatch).
 */
export function resolveInstructionMap(hash: string): InstructionRegistration | null {
  const hit = REGISTRY.get(hash);
  return hit && instructionMapHash(hit.map) === hash ? hit : null;
}

/** The current (V2) map the trusted startup pins into a new runner. */
export const INITIAL_SETUP_INSTRUCTIONS: InstructionMap = INSTRUCTIONS_V2;
export const instructionHashOf = (map: InstructionMap = INITIAL_SETUP_INSTRUCTIONS): string =>
  instructionMapHash(map);
