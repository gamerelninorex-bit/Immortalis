import { createPublicKey } from "node:crypto";
import {
  CANON_WRITE_AUTHORITY,
  CHECKLIST,
  CHRONOLOGY_DOCUMENT_MAX_BYTES,
  CONTEXT_MANIFEST_MISMATCH,
  INITIAL_LOCALITY_PARSER_V1,
  INITIAL_LOCALITY_PARSER_V2,
  INITIAL_SETUP_FACT_KIND_IDS,
  InitialLocalityCompletionSchema,
  InitialSetupDispositionSchema,
  InitialSetupGrantSchema,
  InitialSetupInputSchema,
  InitialSetupInvocationSchema,
  InitialSetupResponseSchema,
  RAW_RESPONSE_MAX_BYTES,
  REFEREE_AUTHORITY,
  REFEREE_OP_INITIAL_DELEGATION,
  SETUP_MESSAGE_MAX_BYTES,
  SceneOutputSchema,
  SceneOutputSchemaV1,
  ScopeDecisionRecordSchema,
  ScopeOutputSchema,
  ScopeOutputSchemaV1,
  canonicalJson,
  compareTime,
  fail,
  initialLocalityCompletionKey,
  initialSetupDispositionKey,
  initialSetupGrantKey,
  initialSetupInputKey,
  initialSetupInvocationKey,
  initialSetupResponseKey,
  isFixtureIdentity,
  ok,
  parseInitialLocalityJson,
  refereeDecisionCause,
  refereeDecisionGroupId,
  refereeDecisionIntentId,
  refereeDecisionKey,
  type ChronologyCapture,
  type CommitGroup,
  type InitialLocalityCompletion,
  type InitialSetupGrant,
  type InitialSetupInput,
  type InitialSetupResponse,
  type OwnerFact,
  type Pin,
  type Result,
  type InitialLocalityParser,
  type SceneOutput,
  type SceneOutputV1,
  type ScopeDecisionRecord,
  type ScopeOutput,
  type ScopeOutputV1,
  type Selection,
  type SetupPhase,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { classifyFact, genesisProjection, GENESIS_KIND_IDS } from "./genesis.ts";
import {
  chronologyCaptureHash,
  chronologyDocumentHash,
  scopeFingerprintOf,
  setupMessageHash,
  sha256Bytes,
  verifyEnvelopeSignature,
} from "./identity.ts";
import { buildProducerInput, contextManifestHashOf, resolveInstructionMap } from "./producer.ts";
import { INITIAL_SETUP_RULES, INITIAL_SETUP_SCOPE_RULE } from "./rules.ts";

/**
 * IM-03 admission (and, unchanged, historical verification) of the six v0.9 Initial Locality Bootstrap record kinds, of the
 * world-subject Referee scope classification, and of the active-Input freeze. Everything here is a PURE function of (group,
 * pre-state): it holds for a raw `store.commit` exactly as it does for the trusted services, and replay judges each group against its
 * own incremental pre-state, so a later fact never re-judges an earlier admission.
 *
 * Evidence policy: a production admission REJECTS the reserved `fixture:` namespace anywhere in qualifying evidence; the testkit-only
 * fixture admission REQUIRES it everywhere. A fixture journal is therefore never silently accepted as real evidence, and real
 * evidence never mixes with fixtures.
 */
export interface InitialSetupPolicy {
  readonly syntheticEvidence: "REJECT" | "REQUIRE";
  /**
   * The parser versions this admission accepts for a NEW bootstrap Input. Absent: production (REJECT) accepts V2 only and the fixture
   * admission (REQUIRE) accepts the frozen V1 history as well as V2. A V2-only fixture policy refuses a retained V1 fixture. Production
   * can never create or resume a V1 route through an alternate literal or compatibility reader.
   */
  readonly parsers?: readonly InitialLocalityParser[];
}
export const PRODUCTION_INITIAL_SETUP_POLICY: InitialSetupPolicy = { syntheticEvidence: "REJECT" };

/** The parser versions a policy admits (see InitialSetupPolicy.parsers). */
export const allowedParsers = (policy: InitialSetupPolicy): readonly InitialLocalityParser[] =>
  policy.parsers ??
  (policy.syntheticEvidence === "REJECT"
    ? [INITIAL_LOCALITY_PARSER_V2]
    : [INITIAL_LOCALITY_PARSER_V1, INITIAL_LOCALITY_PARSER_V2]);

export const INITIAL_SETUP_BASIS = "initial-locality-bootstrap-v9";
export const INITIAL_SETUP_SECRECY = "engine-internal";

/** Deterministic publication identities of a v0.9 record, derived from its key alone. */
export const initialSetupIdentities = (
  key: string,
): { group_id: string; intent_id: string; cause: string } => ({
  group_id: `initial-setup:group:v1:${key}`,
  intent_id: `initial-setup:intent:v1:${key}`,
  cause: `initial-setup:cause:v1:${key}`,
});

const SETUP_KEY = /^world\/([^/]+)\/locus\/([^/]+)\/initial-setup\/(.+)$/;
const SETUP_ID = /^[0-9a-f]{64}$/;

export interface SetupSession {
  readonly setup_id: string;
  readonly input: OwnerFact;
  scopeReservation?: OwnerFact;
  scopeResponse?: OwnerFact;
  sceneResponse?: OwnerFact;
  grant?: OwnerFact;
  disposition?: OwnerFact;
}
export interface SetupIndex {
  readonly sessions: ReadonlyMap<string, SetupSession>;
  readonly sceneReservation: OwnerFact | undefined;
  readonly completion: OwnerFact | undefined;
  /** every Completion in the prefix (at most one per locality; kept plural for the campaign-wide chronology agreement rule) */
  readonly completions: readonly OwnerFact[];
  /** every initial-setup record found, any kind (for ordering/infrastructure checks) */
  readonly count: number;
}

/** One pass over the prefix. Initial-setup groups are rare and exceptional, so this scan is not an ordinary hot path. */
export function scanInitialSetup(facts: ReadonlyMap<string, OwnerFact>): SetupIndex {
  const sessions = new Map<string, SetupSession>();
  const pending: Array<[string, string, OwnerFact]> = [];
  let sceneReservation: OwnerFact | undefined;
  let completion: OwnerFact | undefined;
  const completions: OwnerFact[] = [];
  let count = 0;
  for (const fact of facts.values()) {
    const m = SETUP_KEY.exec(fact.key);
    if (!m) continue;
    const rest = m[3]!;
    count++;
    if (rest === "scene-reservation") sceneReservation = fact;
    else if (rest === "completion") {
      completion = fact;
      completions.push(fact);
    } else {
      const parts = rest.split("/");
      if (parts.length >= 2 && SETUP_ID.test(parts[0]!))
        pending.push([parts[0]!, parts.slice(1).join("/"), fact]);
    }
  }
  for (const [setupId, tail, fact] of pending) {
    if (tail === "input") sessions.set(setupId, { setup_id: setupId, input: fact });
  }
  for (const [setupId, tail, fact] of pending) {
    const s = sessions.get(setupId);
    if (!s) continue;
    if (tail === "scope-reservation") s.scopeReservation = fact;
    else if (tail === "response/SCOPE") s.scopeResponse = fact;
    else if (tail === "response/SCENE") s.sceneResponse = fact;
    else if (tail === "grant") s.grant = fact;
    else if (tail === "disposition") s.disposition = fact;
  }
  return { sessions, sceneReservation, completion, completions, count };
}

/** An Input is ACTIVE until its session has a terminal Disposition or the locality has a Completion. */
export const activeSessions = (index: SetupIndex): SetupSession[] =>
  index.completion ? [] : [...index.sessions.values()].filter((s) => !s.disposition);

const pinOf = (f: OwnerFact): Pin => ({ fact_key: f.key, version: f.version });
const samePin = (a: Pin, b: Pin): boolean => a.fact_key === b.fact_key && a.version === b.version;
const factAt = (state: CampaignState, pin: Pin): OwnerFact | undefined => {
  const f = state.facts.get(pin.fact_key);
  return f && f.version === pin.version ? f : undefined;
};
const busy = (message: string, details?: Record<string, unknown>): Rejection =>
  reject("REFERENCE_INVALID", message, { reason: "SETUP_BUSY", ...details });
const refuse = (reason: string, message: string, details?: Record<string, unknown>): Rejection =>
  reject("VALUE_INVALID", message, { reason, ...details });

// ---------------------------------------------------------------------------------------------------------------------
// Raw response interpretation (shared by the Referee branch, Completion and Disposition validation)
// ---------------------------------------------------------------------------------------------------------------------

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_BASE64 = Math.ceil(RAW_RESPONSE_MAX_BYTES / 3) * 4;

/** Decodes the stored raw bytes with every bound enforced BEFORE decoding; verifies the stored hash. Pure. */
export function decodeRawResponse(
  r: Pick<InitialSetupResponse, "raw_response_base64" | "raw_response_hash">,
): Result<Uint8Array, "RAW_INVALID_BASE64" | "RAW_OVERSIZE" | "RAW_HASH_MISMATCH"> {
  if (r.raw_response_base64.length > MAX_BASE64)
    return fail("RAW_OVERSIZE", "the raw response exceeds its transport bound");
  if (r.raw_response_base64.length % 4 !== 0 || !BASE64.test(r.raw_response_base64))
    return fail("RAW_INVALID_BASE64", "the raw response is not canonical base64");
  const bytes = Buffer.from(r.raw_response_base64, "base64");
  if (bytes.length > RAW_RESPONSE_MAX_BYTES)
    return fail("RAW_OVERSIZE", "the raw response exceeds its transport bound");
  if (bytes.toString("base64") !== r.raw_response_base64)
    return fail("RAW_INVALID_BASE64", "the raw response is not canonical base64");
  if (sha256Bytes(bytes) !== r.raw_response_hash)
    return fail("RAW_HASH_MISMATCH", "the raw response does not hash to its recorded hash");
  return ok(bytes);
}

export type InterpretedResponse =
  | { readonly phase: "SCOPE"; readonly output: ScopeOutput | ScopeOutputV1 }
  | { readonly phase: "SCENE"; readonly output: SceneOutput | SceneOutputV1 };

/**
 * The strict versioned parse of the exact signed raw bytes (INITIAL_LOCALITY_PARSER_V1, then the phase's strict schema), plus the
 * echo bindings: the answer names this task and this producer-input hash. A failure is a plain reason string, never an exception.
 */
export function interpretResponse(
  r: InitialSetupResponse,
): Result<InterpretedResponse, "OUTPUT_INVALID"> {
  const bytes = decodeRawResponse(r);
  if (!bytes.ok) return fail("OUTPUT_INVALID", bytes.error.message, { cause: bytes.error.code });
  const json = parseInitialLocalityJson(bytes.value, RAW_RESPONSE_MAX_BYTES);
  if (!json.ok) return fail("OUTPUT_INVALID", json.error.message, { cause: json.error.code });
  // V2 (current): the model echoes ONLY task_id; an output that carries input_hash is rejected by the strict shape, never stripped.
  // V1 (frozen, fixture history only): the shape that also echoed the producer-input hash. Neither is a fallback for the other.
  if (r.parser === INITIAL_LOCALITY_PARSER_V1) {
    if (r.phase === "SCOPE") {
      const out = ScopeOutputSchemaV1.safeParse(json.value);
      if (!out.success)
        return fail("OUTPUT_INVALID", "the scope output violates its strict contract");
      if (out.data.task_id !== r.task_id || out.data.input_hash !== r.input_hash)
        return fail("OUTPUT_INVALID", "the scope output names a different task or input");
      return ok({ phase: "SCOPE", output: out.data });
    }
    const out = SceneOutputSchemaV1.safeParse(json.value);
    if (!out.success)
      return fail("OUTPUT_INVALID", "the scene output violates its strict contract");
    if (out.data.task_id !== r.task_id || out.data.input_hash !== r.input_hash)
      return fail("OUTPUT_INVALID", "the scene output names a different task or input");
    return ok({ phase: "SCENE", output: out.data });
  }
  if (r.phase === "SCOPE") {
    const out = ScopeOutputSchema.safeParse(json.value);
    if (!out.success)
      return fail("OUTPUT_INVALID", "the scope output violates its strict contract");
    if (out.data.task_id !== r.task_id)
      return fail("OUTPUT_INVALID", "the scope output names a different task");
    return ok({ phase: "SCOPE", output: out.data });
  }
  const out = SceneOutputSchema.safeParse(json.value);
  if (!out.success) return fail("OUTPUT_INVALID", "the scene output violates its strict contract");
  if (out.data.task_id !== r.task_id)
    return fail("OUTPUT_INVALID", "the scene output names a different task");
  return ok({ phase: "SCENE", output: out.data });
}

// ---------------------------------------------------------------------------------------------------------------------
// Fixed record metadata
// ---------------------------------------------------------------------------------------------------------------------

function metadataViolation(
  group: CommitGroup,
  kindId: keyof typeof INITIAL_SETUP_RULES,
): Rejection | null {
  const w = group.writes[0]!;
  if (group.writes.length !== 1 || w.expected_version !== 0)
    return refuse("SINGLE_CREATE", "a bootstrap record is created alone, once");
  if (!canonicalEqual(group.authority, CANON_WRITE_AUTHORITY))
    return refuse(
      "AUTHORITY",
      "a bootstrap record is published by role.archivist + permission.canon.write",
    );
  if (!canonicalEqual(group.rule, INITIAL_SETUP_RULES[kindId]))
    return refuse("RULE", "the group carries the record's own governing citation", { key: w.key });
  if (w.basis !== INITIAL_SETUP_BASIS || w.secrecy !== INITIAL_SETUP_SECRECY || w.unit !== null)
    return refuse("METADATA", "a bootstrap record carries its fixed OwnerFact metadata", {
      key: w.key,
    });
  const ids = initialSetupIdentities(w.key);
  if (
    group.group_id !== ids.group_id ||
    group.intent_id !== ids.intent_id ||
    group.cause !== ids.cause
  )
    return reject(
      "REFERENCE_INVALID",
      "the record is published under the identities its key derives",
      {
        key: w.key,
      },
    );
  return null;
}

/** The group must read exactly the cited facts at their current versions and depend on exactly their committing groups. */
function bindingViolation(
  group: CommitGroup,
  state: CampaignState,
  pins: readonly Pin[],
  what: string,
): Rejection | null {
  const uniq = new Map(pins.map((p) => [p.fact_key, p]));
  for (const p of uniq.values()) {
    const needed = requirePrerequisite(group, state, p.fact_key, what);
    if (isRejection(needed)) return needed;
    if (needed.fact.version !== p.version)
      return reject("REFERENCE_INVALID", "a cited pin is not the committed version", {
        key: p.fact_key,
      });
  }
  const readKeys = new Set(group.reads.map((r) => r.key));
  if (readKeys.size !== uniq.size || ![...uniq.keys()].every((k) => readKeys.has(k)))
    return reject("REFERENCE_INVALID", `the group reads exactly the cited ${what}`);
  const groups = new Set([...uniq.keys()].map((k) => state.facts.get(k)!.provenance.group_id));
  if (group.depends_on.length !== groups.size || !group.depends_on.every((g) => groups.has(g)))
    return reject(
      "REFERENCE_INVALID",
      `the group depends on exactly the groups that committed the ${what}`,
    );
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------------------------------

const evidenceIdentities = (i: InitialSetupInput): string[] => [
  i.author.method_id,
  i.runner.driver_id,
  i.runner.key_id,
  i.chronology.source.method_id,
];

function fixtureViolation(i: InitialSetupInput, policy: InitialSetupPolicy): Rejection | null {
  const fixtures = evidenceIdentities(i).map(isFixtureIdentity);
  if (policy.syntheticEvidence === "REJECT" && fixtures.some(Boolean))
    return refuse(
      "FIXTURE_NAMESPACE",
      "the reserved fixture: namespace is rejected by production admission, startup and replay",
    );
  if (policy.syntheticEvidence === "REQUIRE" && !fixtures.every(Boolean))
    return refuse(
      "FIXTURE_MIX",
      "the fixture admission accepts only wholly fixture-namespaced evidence: real and synthetic evidence never mix",
    );
  return null;
}

/** The chronology capture is checked against itself: hashes, grade use, campaign. */
const withoutCaptureHash = (c: ChronologyCapture): Omit<ChronologyCapture, "capture_hash"> => ({
  format: c.format,
  format_version: c.format_version,
  capture_ref: c.capture_ref,
  campaign_id: c.campaign_id,
  document: c.document,
  document_hash: c.document_hash,
  grade: c.grade,
  source: c.source,
});

export function chronologyEvidenceViolation(
  c: ChronologyCapture,
  campaignId: string,
): { reason: string; message: string } | null {
  if (c.campaign_id !== campaignId)
    return {
      reason: "CHRONOLOGY_CAMPAIGN",
      message: "the chronology capture belongs to another campaign",
    };
  if (c.grade === "TOOL_CALL_ONLY")
    return {
      reason: "CHRONOLOGY_GRADE",
      message:
        "a TOOL_CALL_ONLY chronology capture is diagnostic only and cannot qualify live Input admission",
    };
  if (Buffer.byteLength(canonicalJson(c.document), "utf8") > CHRONOLOGY_DOCUMENT_MAX_BYTES)
    return {
      reason: "CHRONOLOGY_OVERSIZE",
      message: "the chronology document exceeds its transport bound",
    };
  if (chronologyDocumentHash(c.document) !== c.document_hash)
    return { reason: "CHRONOLOGY_HASH", message: "document_hash is not the hash of the document" };
  if (chronologyCaptureHash(withoutCaptureHash(c)) !== c.capture_hash)
    return { reason: "CHRONOLOGY_HASH", message: "capture_hash does not hash the capture" };
  if (c.grade === "ORIGINAL_MESSAGE_VERIFIED" && c.source.original_message_hash === null)
    return {
      reason: "CHRONOLOGY_GRADE",
      message: "an ORIGINAL_MESSAGE_VERIFIED capture names the original message it maps to",
    };
  return null;
}

function checkInput(
  group: CommitGroup,
  state: CampaignState,
  policy: InitialSetupPolicy,
): Rejection | null {
  const bad = metadataViolation(group, "initial_setup_input");
  if (bad) return bad;
  const w = group.writes[0]!;
  const parsed = InitialSetupInputSchema.safeParse(w.value);
  if (!parsed.success)
    return refuse("SCHEMA", "the Input violates its strict contract", { key: w.key });
  const i = parsed.data;
  if (w.key !== initialSetupInputKey(i.world_id, i.locus_id, i.setup_id))
    return reject("REFERENCE_INVALID", "the Input is at the key its identities derive", {
      key: w.key,
    });
  const fx = fixtureViolation(i, policy);
  if (fx) return fx;
  // a NEW bootstrap Input must name a parser this admission supports: production supports V2 only (no V1 route, no compatibility reader)
  if (!allowedParsers(policy).includes(i.parser))
    return refuse(
      "PARSER",
      `this admission does not accept a new bootstrap Input naming ${i.parser}: production supports INITIAL_LOCALITY_PARSER_V2 only`,
    );
  // the pinned instruction map must resolve in the immutable registry and belong to the Input's parser (a later replay needs it)
  const registered = resolveInstructionMap(i.runner.instruction_hash);
  if (!registered || registered.parser !== i.parser)
    return refuse(
      "INSTRUCTION_REGISTRY",
      "the runner's instruction_hash is not a registered instruction map of the Input's parser",
    );
  // only ORIGINAL_MESSAGE_VERIFIED qualifies Input.author, and it must map to the exact full message
  if (i.author.grade !== "ORIGINAL_MESSAGE_VERIFIED")
    return refuse(
      "AUTHOR_GRADE",
      "only ORIGINAL_MESSAGE_VERIFIED qualifies Input.author: a tool call or an operator confirmation is not the player's message",
    );
  if (Buffer.byteLength(i.setup_message, "utf8") > SETUP_MESSAGE_MAX_BYTES)
    return refuse("SETUP_MESSAGE_OVERSIZE", "the setup message exceeds its transport bound");
  if (i.author.original_message_hash !== setupMessageHash(i.setup_message))
    return refuse(
      "AUTHOR_MESSAGE_HASH",
      "the author proof does not map to this exact full setup message",
    );
  const chron = chronologyEvidenceViolation(i.chronology, group.campaign_id);
  if (chron) return refuse(chron.reason, chron.message);
  try {
    createPublicKey({
      key: Buffer.from(i.runner.public_key, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    return refuse("RUNNER_KEY", "the pinned runner key is not an Ed25519 SubjectPublicKeyInfo");
  }
  // the closed original-genesis whitelist and the total projection, recomputed on the actual pre-state
  const projection = genesisProjection(state.facts);
  if (!projection.ok)
    return reject("REFERENCE_INVALID", projection.error.message, {
      reason: projection.error.code,
      ...projection.error.details,
    });
  const p = projection.value;
  if (
    p.world_id !== i.world_id ||
    p.locus_id !== i.locus_id ||
    !samePin(p.source, i.source) ||
    !(p.pc === null ? i.pc === null : i.pc !== null && samePin(p.pc, i.pc)) ||
    p.projection_hash !== i.projection_hash ||
    !canonicalEqual(p.pins, i.genesis)
  )
    return reject(
      "REFERENCE_INVALID",
      "the Input does not match the total genesis projection of the actual pre-state",
      {
        reason: "PROJECTION_MISMATCH",
      },
    );
  if (
    i.scope_fingerprint !==
    scopeFingerprintOf({
      world_id: i.world_id,
      locus_id: i.locus_id,
      setup_message_hash: setupMessageHash(i.setup_message),
      projection_hash: i.projection_hash,
      chronology_document_hash: i.chronology.document_hash,
    })
  )
    return reject(
      "REFERENCE_INVALID",
      "scope_fingerprint is not derived from the message, projection and chronology",
      {
        reason: "FINGERPRINT",
      },
    );
  if (
    i.pre_state.head !== `revision:${state.revision}` ||
    i.pre_state.basis_hash !==
      sha256Canonical({ projection: i.projection_hash, revision: state.revision })
  )
    return reject(
      "REFERENCE_INVALID",
      "the Input was built against a different pre-state (stale or forged head)",
      {
        reason: "PRE_STATE",
      },
    );
  // ordering, one-locality cut, freeze and deduplication
  const index = scanInitialSetup(state.facts);
  if (index.completion)
    return reject(
      "REFERENCE_INVALID",
      "the locality already has its one Completion: no further setup session starts",
      {
        reason: "COMPLETION_EXISTS",
      },
    );
  if (index.sceneReservation)
    return reject(
      "REFERENCE_INVALID",
      "a scene-selection reservation exists: after any SCENE reservation no new session is allowed for the locality",
      { reason: "SCENE_RESERVED" },
    );
  for (const s of index.sessions.values()) {
    const prior = InitialSetupInputSchema.parse(s.input.value);
    if (prior.world_id !== i.world_id || prior.locus_id !== i.locus_id)
      return reject(
        "REFERENCE_INVALID",
        "this cut admits bootstrap Inputs for only one world/locus pair per campaign",
        { reason: "ONE_LOCALITY" },
      );
    if (prior.scope_fingerprint === i.scope_fingerprint)
      return reject(
        "REFERENCE_INVALID",
        "the same-locality scope fingerprint is already consumed: repetition returns the original result or terminal barrier and never invokes classification again",
        { reason: "DUPLICATE_FINGERPRINT", setup_id: s.setup_id },
      );
    if (s.setup_id === i.setup_id)
      return reject("REFERENCE_INVALID", "the setup session already exists", {
        reason: "DUPLICATE_SESSION",
      });
    if (!s.disposition)
      return busy("another setup session is active for this locality", { setup_id: s.setup_id });
  }
  // the chronology may not differ from any existing accepted Completion (only one per locality, kept for the campaign-wide rule)
  return bindingViolation(group, state, i.genesis, "genesis facts");
}

// ---------------------------------------------------------------------------------------------------------------------
// Invocation (reservation)
// ---------------------------------------------------------------------------------------------------------------------

function sessionOf(index: SetupIndex, setupId: string): SetupSession | undefined {
  return index.sessions.get(setupId);
}

function checkInvocation(group: CommitGroup, state: CampaignState): Rejection | null {
  const bad = metadataViolation(group, "initial_setup_invocation");
  if (bad) return bad;
  const w = group.writes[0]!;
  const parsed = InitialSetupInvocationSchema.safeParse(w.value);
  if (!parsed.success)
    return refuse("SCHEMA", "the reservation violates its strict contract", { key: w.key });
  const v = parsed.data;
  if (w.key !== initialSetupInvocationKey(v.world_id, v.locus_id, v.phase, v.setup_id))
    return reject("REFERENCE_INVALID", "the reservation is at the key its phase derives", {
      key: w.key,
    });
  const inputFact = factAt(state, v.input);
  if (!inputFact)
    return reject("PREREQUISITE_MISSING", "the Input pin is not committed", {
      key: v.input.fact_key,
    });
  const input = InitialSetupInputSchema.parse(inputFact.value);
  if (
    input.setup_id !== v.setup_id ||
    input.world_id !== v.world_id ||
    input.locus_id !== v.locus_id
  )
    return reject("REFERENCE_INVALID", "the reservation names another session");
  const index = scanInitialSetup(state.facts);
  const session = sessionOf(index, v.setup_id);
  if (!session) return reject("PREREQUISITE_MISSING", "the session has no Input");
  if (index.completion || session.disposition)
    return reject(
      "REFERENCE_INVALID",
      "a disposed or completed session admits no further reservation",
      {
        reason: "SESSION_TERMINAL",
      },
    );
  const projection = genesisProjection(state.facts);
  if (!projection.ok || projection.value.projection_hash !== input.projection_hash)
    return reject("REFERENCE_INVALID", "the frozen genesis projection changed after the Input", {
      reason: "PROJECTION_MISMATCH",
    });
  let producer;
  if (v.phase === "SCOPE") {
    if (v.grant !== null) return refuse("GRANT", "a SCOPE reservation carries no grant");
    if (session.scopeReservation)
      return reject("REFERENCE_INVALID", "one SCOPE reservation per session");
    producer = buildProducerInput({
      campaign_id: group.campaign_id,
      phase: "SCOPE",
      input_pin: v.input,
      input,
      genesis: projection.value.facts,
    });
  } else {
    if (v.grant === null) return refuse("GRANT", "a SCENE reservation carries its accepted grant");
    if (index.sceneReservation)
      return reject(
        "REFERENCE_INVALID",
        "at most one SCENE reservation per locality, across all sessions",
        {
          reason: "SCENE_RESERVED",
        },
      );
    const grantFact = factAt(state, v.grant);
    if (!grantFact || grantFact !== session.grant)
      return reject(
        "PREREQUISITE_MISSING",
        "the SCENE reservation needs this session's accepted grant",
      );
    const grant = InitialSetupGrantSchema.parse(grantFact.value);
    const scope = scopeOutputOf(state, grant);
    if (!scope.ok)
      return reject("REFERENCE_INVALID", scope.error.message, { reason: "SCOPE_UNAVAILABLE" });
    producer = buildProducerInput({
      campaign_id: group.campaign_id,
      phase: "SCENE",
      input_pin: v.input,
      input,
      genesis: projection.value.facts,
      grant: v.grant,
      scope: scope.value,
    });
  }
  if (!producer.ok) return refuse(producer.error.code, producer.error.message);
  if (producer.value.task_id !== v.task_id || producer.value.input_hash !== v.input_hash)
    return reject(
      "REFERENCE_INVALID",
      "the reservation's task and input hash are not those of the engine-built producer input",
      {
        reason: "TASK_BINDING",
      },
    );
  if (v.parser !== input.parser)
    return refuse(
      "PARSER",
      "the reservation names another parser than its Input: no mixing within a session",
    );
  const pins = v.grant ? [v.input, v.grant] : [v.input];
  return bindingViolation(group, state, pins, "session facts");
}

function scopeOutputOf(
  state: CampaignState,
  grant: InitialSetupGrant,
): Result<ScopeOutput, "SCOPE_UNAVAILABLE"> {
  const resp = factAt(state, grant.scope_response);
  if (!resp) return fail("SCOPE_UNAVAILABLE", "the accepted scope response is not committed");
  const r = InitialSetupResponseSchema.parse(resp.value);
  const out = interpretResponse(r);
  if (!out.ok || out.value.phase !== "SCOPE")
    return fail("SCOPE_UNAVAILABLE", "the accepted scope response does not parse");
  return ok(out.value.output);
}

// ---------------------------------------------------------------------------------------------------------------------
// Context manifest (C-1 CE-1)
// ---------------------------------------------------------------------------------------------------------------------

export type ManifestVerdict = "MATCH" | "MISMATCH" | "UNVERIFIABLE";

/**
 * Recomputes the context manifest a retained Response MUST report and compares it with the manifest the runner signed: SHA-256 of
 * canonicalJson({instructions: the exact phase string from the immutable registry entry keyed by the Input's instruction_hash,
 * producer_input_sha: SHA-256(D)}), where D is rebuilt from the canonical Input, the total genesis projection and (SCENE) the accepted
 * Grant and scope. A missing or unverifiable canonical source or registry entry is UNVERIFIABLE and FAILS CLOSED - it is never
 * classified as a proved mismatch. The manifest attests the declared visible context, not a provider's invisible honesty.
 */
export function manifestVerdict(
  state: CampaignState,
  response: InitialSetupResponse,
): ManifestVerdict {
  const index = scanInitialSetup(state.facts);
  const session = sessionOf(index, response.setup_id);
  if (!session) return "UNVERIFIABLE";
  const inputParsed = InitialSetupInputSchema.safeParse(session.input.value);
  if (!inputParsed.success) return "UNVERIFIABLE";
  const input = inputParsed.data;
  const registration = resolveInstructionMap(input.runner.instruction_hash);
  if (!registration || registration.parser !== input.parser) return "UNVERIFIABLE";
  const reservation = factAt(state, response.reservation);
  const inv = reservation ? InitialSetupInvocationSchema.safeParse(reservation.value) : undefined;
  if (!inv?.success || inv.data.phase !== response.phase) return "UNVERIFIABLE";
  const projection = genesisProjection(state.facts);
  if (!projection.ok) return "UNVERIFIABLE";
  let producer;
  if (response.phase === "SCOPE") {
    producer = buildProducerInput({
      campaign_id: state.campaign_id,
      phase: "SCOPE",
      input_pin: pinOf(session.input),
      input,
      genesis: projection.value.facts,
    });
  } else {
    if (!inv.data.grant) return "UNVERIFIABLE";
    const grantFact = factAt(state, inv.data.grant);
    const grant = grantFact ? InitialSetupGrantSchema.safeParse(grantFact.value) : undefined;
    if (!grant?.success) return "UNVERIFIABLE";
    const scope = scopeOutputOf(state, grant.data);
    if (!scope.ok) return "UNVERIFIABLE";
    producer = buildProducerInput({
      campaign_id: state.campaign_id,
      phase: "SCENE",
      input_pin: pinOf(session.input),
      input,
      genesis: projection.value.facts,
      grant: inv.data.grant,
      scope: scope.value,
    });
  }
  if (
    !producer.ok ||
    producer.value.task_id !== inv.data.task_id ||
    producer.value.input_hash !== inv.data.input_hash
  )
    return "UNVERIFIABLE";
  const expected = contextManifestHashOf(registration.map[response.phase], producer.value.bytes);
  return response.envelope.body.context_manifest_hash === expected ? "MATCH" : "MISMATCH";
}

/** A retained Response may be QUALIFIED (classified, granted, completed) only when its signed manifest matches the recomputed one. */
const manifestViolation = (
  state: CampaignState,
  response: InitialSetupResponse,
): Rejection | null => {
  const v = manifestVerdict(state, response);
  return v === "MATCH"
    ? null
    : v === "MISMATCH"
      ? reject(
          "REFERENCE_INVALID",
          "the signed context manifest differs from the recomputed one: the answer is INVALID_OUTPUT, never qualified",
          { reason: CONTEXT_MANIFEST_MISMATCH },
        )
      : reject(
          "PREREQUISITE_MISSING",
          "the context manifest cannot be verified (a canonical source or the instruction registry is unavailable): failing closed",
          { reason: "MANIFEST_UNVERIFIABLE" },
        );
};

// ---------------------------------------------------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------------------------------------------------

function checkResponse(group: CommitGroup, state: CampaignState): Rejection | null {
  const bad = metadataViolation(group, "initial_setup_response");
  if (bad) return bad;
  const w = group.writes[0]!;
  const parsed = InitialSetupResponseSchema.safeParse(w.value);
  if (!parsed.success)
    return refuse("SCHEMA", "the Response violates its strict contract", { key: w.key });
  const r = parsed.data;
  if (w.key !== initialSetupResponseKey(r.world_id, r.locus_id, r.setup_id, r.phase))
    return reject("REFERENCE_INVALID", "the Response is at the key its phase derives", {
      key: w.key,
    });
  const reservation = factAt(state, r.reservation);
  if (!reservation)
    return reject("PREREQUISITE_MISSING", "the Response needs its committed reservation");
  const inv = InitialSetupInvocationSchema.parse(reservation.value);
  if (
    inv.setup_id !== r.setup_id ||
    inv.phase !== r.phase ||
    inv.task_id !== r.task_id ||
    inv.input_hash !== r.input_hash ||
    inv.world_id !== r.world_id ||
    inv.locus_id !== r.locus_id
  )
    return reject(
      "REFERENCE_INVALID",
      "the Response is not bound to this reservation, task, input and phase",
      {
        reason: "RESERVATION_BINDING",
      },
    );
  const index = scanInitialSetup(state.facts);
  const session = sessionOf(index, r.setup_id);
  if (!session) return reject("PREREQUISITE_MISSING", "the Response's session has no Input");
  if (index.completion || session.disposition)
    return reject(
      "REFERENCE_INVALID",
      "a disposed or completed session admits no further Response",
      {
        reason: "SESSION_TERMINAL",
      },
    );
  const input = InitialSetupInputSchema.parse(session.input.value);
  const bytes = decodeRawResponse(r);
  if (!bytes.ok) return refuse(bytes.error.code, bytes.error.message);
  const env = r.envelope.body;
  const mismatches: string[] = [];
  const expect = (name: string, ok_: boolean) => {
    if (!ok_) mismatches.push(name);
  };
  expect("campaign_id", env.campaign_id === group.campaign_id);
  expect("world_id", env.world_id === r.world_id);
  expect("locus_id", env.locus_id === r.locus_id);
  expect("setup_id", env.setup_id === r.setup_id);
  expect("phase", env.phase === r.phase);
  expect("task_id", env.task_id === r.task_id);
  expect("reservation", samePin(env.reservation, r.reservation));
  expect("input_hash", env.input_hash === r.input_hash);
  expect("projection_hash", env.projection_hash === input.projection_hash);
  expect("key_id", env.key_id === input.runner.key_id);
  expect("runner_id", env.runner_id === input.runner.runner_id);
  expect("instruction_hash", env.instruction_hash === input.runner.instruction_hash);
  expect("driver_id", env.driver_id === input.runner.driver_id);
  expect("driver_config_hash", env.driver_config_hash === input.runner.driver_config_hash);
  expect("parser", env.parser === input.parser && r.parser === input.parser);
  expect("raw_response_hash", env.raw_response_hash === r.raw_response_hash);
  if (mismatches.length > 0)
    return reject(
      "REFERENCE_INVALID",
      `the signed envelope disagrees with the reservation: ${mismatches.join(", ")}`,
      {
        reason: "ENVELOPE_BINDING",
      },
    );
  // signature against the ADMISSION-TIME key pinned in Input.runner, never a key the answer supplies
  if (!verifyEnvelopeSignature(r.envelope, input.runner.public_key))
    return refuse(
      "SIGNATURE",
      "the envelope signature does not verify under the Input's pinned runner key",
    );
  return bindingViolation(
    group,
    state,
    [r.reservation, session ? pinOf(session.input) : r.reservation],
    "reservation and Input",
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Scope restrictions, mechanical consistency
// ---------------------------------------------------------------------------------------------------------------------

/** The closed normalized restriction forms are checked mechanically against a Selection. */
export function restrictionViolation(
  restrictions: ScopeOutput["restrictions"],
  selection: Selection,
): string | null {
  for (const r of restrictions) {
    switch (r.predicate) {
      case "NO_NON_PC_ACTORS":
        if (selection.actors.kind !== "NONE_IN_DOMAIN")
          return "NO_NON_PC_ACTORS: the selection does not establish that no non-PC actor is in the domain";
        break;
      case "NO_SOURCE_CLAIMS":
        if (selection.source_claims.some((c) => c.kind !== "NONE_ESTABLISHED"))
          return "NO_SOURCE_CLAIMS: the selection establishes or leaves open a source claim";
        break;
      case "REQUIRE_CLOSED_DOMAIN":
        if (selection.closure.kind !== "CLOSED")
          return "REQUIRE_CLOSED_DOMAIN: the selection does not close the domain";
        break;
      case "REQUIRE_OPEN_DOMAIN":
        if (selection.closure.kind !== "OPEN")
          return "REQUIRE_OPEN_DOMAIN: the selection does not leave the domain open";
        break;
    }
  }
  return null;
}

const contradictory = (r: ScopeOutput["restrictions"]): boolean => {
  const has = (p: string) => r.some((x) => x.predicate === p);
  return has("REQUIRE_CLOSED_DOMAIN") && has("REQUIRE_OPEN_DOMAIN");
};

/**
 * The verdict the trusted Referee service derives from a SCOPE output (never the host's claim). SCOPE_AUTHORIZED requires
 * SETUP_AUTHORSHIP_ONLY, every facet delegated or fixed by source, no unhandled constraint or clarification and mutually consistent
 * restrictions; MIXED_INPUT follows the authored/action split; every other valid source refusal is SCOPE_REFUSED.
 */
export function scopeVerdict(out: ScopeOutput): ScopeDecisionRecord["verdict"] {
  if (out.message_use === "MIXED_INPUT") return "MIXED_INPUT";
  if (
    out.message_use === "SETUP_AUTHORSHIP_ONLY" &&
    out.facets.every((f) => f.mode !== "NOT_AUTHORIZED") &&
    out.unhandled_constraints.length === 0 &&
    out.clarification === null &&
    !contradictory(out.restrictions)
  )
    return "SCOPE_AUTHORIZED";
  return "SCOPE_REFUSED";
}

const occurs = (hay: string, quote: string): boolean => hay.includes(quote);

/** Quote and source-ref conformance of a SCOPE output against the accepted setup message and the Input's genesis. */
export function scopeEvidenceViolation(
  out: ScopeOutput,
  input: InitialSetupInput,
  sourceText: string,
): string | null {
  const known = new Set(input.genesis.map((p) => p.fact_key + "@" + p.version));
  for (const f of out.facets) {
    for (const q of f.evidence_quotes)
      if (!occurs(input.setup_message, q) && !occurs(sourceText, q))
        return `${f.facet}: a quote occurs in neither the accepted instruction nor a cited source`;
    for (const s of f.source_refs)
      if (!known.has(s.fact_key + "@" + s.version))
        return `${f.facet}: a source ref is not an admitted genesis pin`;
    if (f.mode === "DELEGATED" && f.evidence_quotes.length === 0)
      return `${f.facet}: DELEGATED needs an evidence quote from the accepted instruction`;
    if (f.mode === "FIXED_BY_SOURCE" && f.source_refs.length === 0)
      return `${f.facet}: FIXED_BY_SOURCE identifies an actual fixed value through a source ref`;
  }
  for (const r of out.restrictions)
    if (!occurs(input.setup_message, r.evidence_quote))
      return "a restriction's evidence quote does not occur in the accepted instruction";
  return null;
}

/** The canonical text of the total genesis projection: the cited-source haystack for quote conformance. */
export function genesisSourceText(facts: ReadonlyMap<string, OwnerFact>): string {
  const p = genesisProjection(facts);
  return canonicalJson(p.ok ? p.value.facts : []);
}

/**
 * The verdict the engine derives for a SCOPE output against the accepted Input and the actual genesis — never a host's claim.
 * A quote or source-ref that does not conform demotes an otherwise authorized scope to SCOPE_REFUSED. Shared by the trusted service,
 * the Referee admission and Disposition validation so they cannot drift.
 */
export function derivedScopeVerdict(
  out: ScopeOutput,
  input: InitialSetupInput,
  facts: ReadonlyMap<string, OwnerFact>,
): ScopeDecisionRecord["verdict"] {
  return scopeEvidenceViolation(out, input, genesisSourceText(facts))
    ? "SCOPE_REFUSED"
    : scopeVerdict(out);
}

// ---------------------------------------------------------------------------------------------------------------------
// Referee scope classification (the world-subject alternate branch)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Admission of the WG_INITIAL_DELEGATION_CLASSIFY decision: one create-only record at the Referee task key, written under the
 * operation-specific rule, derived entirely from the signed canonical Response and the cited Input and reservation (never from a
 * host's claim). Ordinary referee tools cannot reach this: the value is world-subject and only the trusted service publishes it.
 */
export function scopeDecisionGroupCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  if (group.writes.length !== 1 || group.writes[0]!.expected_version !== 0)
    return refuse("SINGLE_CREATE", "a scope classification is created once");
  const w = group.writes[0]!;
  const parsed = ScopeDecisionRecordSchema.safeParse(w.value);
  if (!parsed.success)
    return refuse("SCHEMA", "the scope classification violates its strict contract", {
      key: w.key,
    });
  const r = parsed.data;
  if (!canonicalEqual(group.rule, INITIAL_SETUP_SCOPE_RULE))
    return refuse(
      "RULE",
      "a scope classification carries INITIAL_SETUP_SCOPE_V9_RULE, exclusively",
    );
  if (!canonicalEqual(group.authority, CANON_WRITE_AUTHORITY))
    return refuse("AUTHORITY", "published by role.archivist + permission.canon.write");
  if (!canonicalEqual(r.authority, REFEREE_AUTHORITY))
    return refuse("AUTHORITY", "the record carries role.gm + permission.rule.adjudicate");
  if (
    w.key !== refereeDecisionKey(r.task_id) ||
    group.group_id !== refereeDecisionGroupId(r.task_id) ||
    group.intent_id !== refereeDecisionIntentId(r.task_id) ||
    group.cause !== refereeDecisionCause(r.task_id)
  )
    return reject(
      "REFERENCE_INVALID",
      "the record is at the key and under the identities its task derives",
      { key: w.key },
    );
  if (r.campaign_id !== group.campaign_id)
    return reject("REFERENCE_INVALID", "the classification names another campaign");
  const inputFact = factAt(state, r.input.setup_input);
  const reservationFact = factAt(state, r.input.reservation);
  const responseFact = factAt(state, r.input.response);
  if (!inputFact || !reservationFact || !responseFact)
    return reject(
      "PREREQUISITE_MISSING",
      "the classification cites an uncommitted Input, reservation or Response",
    );
  const input = InitialSetupInputSchema.parse(inputFact.value);
  const inv = InitialSetupInvocationSchema.parse(reservationFact.value);
  const resp = InitialSetupResponseSchema.parse(responseFact.value);
  if (
    inv.phase !== "SCOPE" ||
    resp.phase !== "SCOPE" ||
    inv.task_id !== r.task_id ||
    resp.task_id !== r.task_id ||
    !samePin(resp.reservation, r.input.reservation) ||
    !samePin(inv.input, r.input.setup_input) ||
    input.world_id !== r.subject.world_id ||
    input.locus_id !== r.subject.locus_id ||
    r.input.digest !== resp.input_hash
  )
    return reject(
      "REFERENCE_INVALID",
      "the classification is not bound to its SCOPE reservation and Response",
      {
        reason: "SCOPE_BINDING",
      },
    );
  const interpreted = interpretResponse(resp);
  if (!interpreted.ok || interpreted.value.phase !== "SCOPE")
    return refuse(
      "OUTPUT_INVALID",
      "the signed response is not a valid SCOPE output: it is retained and disposed, not classified",
    );
  const manifest = manifestViolation(state, resp);
  if (manifest) return manifest;
  if (!canonicalEqual(interpreted.value.output, r.decision))
    return refuse(
      "DECISION_MISMATCH",
      "the decision is not the strict parse of the exact signed response",
    );
  const derived = derivedScopeVerdict(r.decision, input, state.facts);
  if (r.verdict !== derived)
    return refuse(
      "VERDICT",
      `the verdict is derived by the engine (${derived}), never claimed by a host`,
      {
        key: w.key,
      },
    );
  return bindingViolation(
    group,
    state,
    [r.input.setup_input, r.input.reservation, r.input.response],
    "classification sources",
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Grant
// ---------------------------------------------------------------------------------------------------------------------

function checkGrant(group: CommitGroup, state: CampaignState): Rejection | null {
  const bad = metadataViolation(group, "initial_setup_grant");
  if (bad) return bad;
  const w = group.writes[0]!;
  const parsed = InitialSetupGrantSchema.safeParse(w.value);
  if (!parsed.success)
    return refuse("SCHEMA", "the Grant violates its strict contract", { key: w.key });
  const g = parsed.data;
  if (w.key !== initialSetupGrantKey(g.world_id, g.locus_id, g.setup_id))
    return reject("REFERENCE_INVALID", "the Grant is at the key its session derives", {
      key: w.key,
    });
  const index = scanInitialSetup(state.facts);
  const session = sessionOf(index, g.setup_id);
  if (!session) return reject("PREREQUISITE_MISSING", "the Grant's session has no Input");
  if (index.completion || session.disposition || session.grant)
    return reject("REFERENCE_INVALID", "one Grant per active session", {
      reason: "SESSION_TERMINAL",
    });
  const inputFact = factAt(state, g.input);
  if (!inputFact || inputFact !== session.input)
    return reject("REFERENCE_INVALID", "the Grant names another Input");
  const input = InitialSetupInputSchema.parse(inputFact.value);
  const classification = factAt(state, g.classification);
  const scopeResp = factAt(state, g.scope_response);
  if (!classification || !scopeResp)
    return reject(
      "PREREQUISITE_MISSING",
      "the Grant needs its classification and signed SCOPE response",
    );
  const decision = ScopeDecisionRecordSchema.safeParse(classification.value);
  if (!decision.success)
    return refuse("CLASSIFICATION", "the cited classification is not a scope decision");
  const scopeResponseParsed = InitialSetupResponseSchema.safeParse(scopeResp.value);
  if (!scopeResponseParsed.success)
    return refuse("CLASSIFICATION", "the cited SCOPE response is not a Response");
  const grantManifest = manifestViolation(state, scopeResponseParsed.data);
  if (grantManifest) return grantManifest;
  if (decision.data.verdict !== "SCOPE_AUTHORIZED")
    return refuse("CLASSIFICATION", "a grant exists only after an accepted scope classification");
  if (
    !samePin(decision.data.input.response, g.scope_response) ||
    !samePin(decision.data.input.setup_input, g.input)
  )
    return reject(
      "REFERENCE_INVALID",
      "the Grant's classification does not belong to its response and Input",
    );
  if (
    !canonicalEqual(g.facets, decision.data.decision.facets) ||
    !canonicalEqual(g.restrictions, decision.data.decision.restrictions)
  )
    return reject(
      "REFERENCE_INVALID",
      "the Grant carries the complete normalized scope, unchanged",
    );
  if (g.scope_hash !== sha256Canonical(decision.data.decision))
    return reject("REFERENCE_INVALID", "scope_hash is not the hash of the complete accepted scope");
  if (g.chronology_hash !== input.chronology.document_hash)
    return reject(
      "REFERENCE_INVALID",
      "the Grant carries no adapter-selected time: chronology_hash is the Input capture's document hash",
    );
  return bindingViolation(
    group,
    state,
    [g.input, g.classification, g.scope_response],
    "grant sources",
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------------------------------------------------

/** The selected leaves, one provenance entry each: no omitted, duplicate or foreign path. */
export function selectionLeafPaths(s: Selection): string[] {
  return [
    "domain.designation",
    "domain.topology",
    "closure.kind",
    "closure.ground",
    "actors.kind",
    "actors.constraints",
    "actors.ground",
    ...s.source_claims.map((c) => `source_claims.${c.source.fact_key}`),
    "workforce.scope_statement",
    "coverage.start",
    "coverage.end",
    "coverage.ground",
  ].sort();
}

const FACET_OF_LEAF = (path: string): (typeof CHECKLIST)[number] =>
  path.startsWith("actors.")
    ? "ACTOR_COVERAGE"
    : path.startsWith("source_claims.")
      ? "SOURCE_CLAIMS"
      : path.startsWith("workforce.")
        ? "WORKFORCE_COVERAGE"
        : "DOMAIN_BOUNDARY";

/**
 * Completion validation: a NAMED PURE FUNCTION of the frozen pre-state and the signed response (companion "Admission and Freeze").
 * It validates shape, authority, binding, source compatibility and scope only — never rejects because the selected branch prevents
 * collection. Returns a stable rejection code or null.
 */
export function completionViolation(
  state: CampaignState,
  c: InitialLocalityCompletion,
): { code: string; message: string } | null {
  const inputFact = factAt(state, c.input);
  const grantFact = factAt(state, c.grant);
  const sceneFact = factAt(state, c.scene_response);
  if (!inputFact || !grantFact || !sceneFact)
    return {
      code: "PREREQUISITE_MISSING",
      message: "the Completion cites an uncommitted Input, grant or scene response",
    };
  const input = InitialSetupInputSchema.parse(inputFact.value);
  const grant = InitialSetupGrantSchema.parse(grantFact.value);
  const resp = InitialSetupResponseSchema.parse(sceneFact.value);
  if (
    grant.setup_id !== c.setup_id ||
    resp.setup_id !== c.setup_id ||
    input.setup_id !== c.setup_id ||
    resp.phase !== "SCENE" ||
    !samePin(grant.input, c.input)
  )
    return {
      code: "BINDING",
      message: "the Completion's records belong to different sessions or phases",
    };
  const projection = genesisProjection(state.facts);
  if (!projection.ok || projection.value.projection_hash !== input.projection_hash)
    return {
      code: "PROJECTION_CHANGED",
      message: "the frozen genesis projection no longer matches the Input",
    };
  const interpreted = interpretResponse(resp);
  if (!interpreted.ok || interpreted.value.phase !== "SCENE")
    return {
      code: "OUTPUT_INVALID",
      message: "the signed scene response is not a valid SCENE output",
    };
  if (interpreted.value.output.kind !== "SELECTION")
    return {
      code: "NOT_A_SELECTION",
      message: "an UNRESOLVED scene result is retained terminally and never completes",
    };
  const selection = interpreted.value.output.selection;
  if (!canonicalEqual(selection, c.selection))
    return {
      code: "SELECTION_MISMATCH",
      message: "the Completion's selection is not the strict parse of the exact signed response",
    };
  // exact source: the admitted source once
  if (
    selection.source_claims.length !== 1 ||
    !samePin(selection.source_claims[0]!.source, input.source)
  )
    return {
      code: "SOURCE_CLAIMS",
      message: "source_claims names exactly the admitted source, once",
    };
  // chronology: start equals the authored time, same unit, end strictly later
  const doc = input.chronology.document;
  const startVsDoc = compareTime(selection.coverage.start, doc.time);
  const endVsStart = compareTime(selection.coverage.end, selection.coverage.start);
  if (startVsDoc !== 0)
    return {
      code: "CHRONOLOGY_START",
      message: "coverage.start must equal the authored chronology time, in its unit",
    };
  if (endVsStart !== 1)
    return {
      code: "CHRONOLOGY_END",
      message: "coverage.end must be strictly later than the start, in the same unit",
    };
  const restricted = restrictionViolation(grant.restrictions, selection);
  if (restricted) return { code: "RESTRICTION", message: restricted };
  // provenance: one entry per selected leaf
  const leaves = selectionLeafPaths(selection);
  const paths = selection.provenance.map((p) => p.path).sort();
  if (paths.length !== leaves.length || paths.some((p, i) => p !== leaves[i]))
    return {
      code: "PROVENANCE_PATHS",
      message:
        "provenance has exactly one entry per selected leaf: no omitted, duplicate or foreign path",
    };
  const sourceText = canonicalJson(projection.value.facts) + "\n" + doc.statement;
  for (const p of selection.provenance) {
    if (p.origin !== "PLAYER_AUTHORED" && p.origin !== "PLAYER_DELEGATED")
      return {
        code: "PROVENANCE_ORIGIN",
        message:
          "only PLAYER_AUTHORED and PLAYER_DELEGATED are emitted by selection; WORLD_COMPLETION, ACTOR_DECISION and ENGINE_DERIVED are not",
      };
    const facet = grant.facets.find((f) => f.facet === FACET_OF_LEAF(p.path))!;
    if (p.origin === "PLAYER_DELEGATED") {
      if (p.grant === null || !samePin(p.grant, c.grant))
        return { code: "PROVENANCE_GRANT", message: "PLAYER_DELEGATED needs this session's grant" };
      if (facet.mode !== "DELEGATED")
        return {
          code: "PROVENANCE_FACET",
          message:
            "a leaf of a facet fixed by source or not authorized is not a delegated selection",
        };
    } else {
      if (p.grant !== null)
        return { code: "PROVENANCE_GRANT", message: "PLAYER_AUTHORED carries no grant" };
      if (p.evidence_quotes.length === 0 && p.source_refs.length === 0)
        return {
          code: "PROVENANCE_EVIDENCE",
          message: "PLAYER_AUTHORED needs an exact already accepted source value or quote",
        };
      for (const q of p.evidence_quotes)
        if (!occurs(input.setup_message, q) && !occurs(sourceText, q))
          return {
            code: "PROVENANCE_QUOTE",
            message:
              "a provenance quote occurs in neither the accepted instruction nor a cited source",
          };
      const known = new Set(input.genesis.map((x) => x.fact_key + "@" + x.version));
      for (const s of p.source_refs)
        if (!known.has(s.fact_key + "@" + s.version))
          return {
            code: "PROVENANCE_REF",
            message: "a provenance source ref is not an admitted genesis pin",
          };
    }
  }
  return null;
}

function checkCompletion(group: CommitGroup, state: CampaignState): Rejection | null {
  const bad = metadataViolation(group, "initial_locality_completion");
  if (bad) return bad;
  const w = group.writes[0]!;
  const parsed = InitialLocalityCompletionSchema.safeParse(w.value);
  if (!parsed.success)
    return refuse("SCHEMA", "the Completion violates its strict contract", { key: w.key });
  const c = parsed.data;
  if (w.key !== initialLocalityCompletionKey(c.world_id, c.locus_id))
    return reject("REFERENCE_INVALID", "the Completion is at the locality's one Completion key", {
      key: w.key,
    });
  const index = scanInitialSetup(state.facts);
  const session = sessionOf(index, c.setup_id);
  if (!session) return reject("PREREQUISITE_MISSING", "the Completion's session has no Input");
  if (index.completion || session.disposition)
    return reject(
      "REFERENCE_INVALID",
      "at most one Completion per locality, and never after a terminal disposition",
      {
        reason: "SESSION_TERMINAL",
      },
    );
  if (!index.sceneReservation)
    return reject("PREREQUISITE_MISSING", "a Completion needs its SCENE reservation");
  const rv = InitialSetupInvocationSchema.parse(index.sceneReservation.value);
  if (rv.setup_id !== c.setup_id || !rv.grant || !samePin(rv.grant, c.grant))
    return reject("REFERENCE_INVALID", "the SCENE reservation belongs to another session or grant");
  const sceneFact = factAt(state, c.scene_response);
  const sceneResponse = sceneFact
    ? InitialSetupResponseSchema.safeParse(sceneFact.value)
    : undefined;
  if (!sceneResponse?.success)
    return reject("PREREQUISITE_MISSING", "the Completion needs its retained SCENE response");
  const completionManifest = manifestViolation(state, sceneResponse.data);
  if (completionManifest) return completionManifest;
  const violation = completionViolation(state, c);
  if (violation)
    return reject("VALUE_INVALID", violation.message, { reason: `COMPLETION_${violation.code}` });
  return bindingViolation(group, state, [c.input, c.grant, c.scene_response], "completion sources");
}

// ---------------------------------------------------------------------------------------------------------------------
// Disposition
// ---------------------------------------------------------------------------------------------------------------------

function checkDisposition(group: CommitGroup, state: CampaignState): Rejection | null {
  const bad = metadataViolation(group, "initial_setup_disposition");
  if (bad) return bad;
  const w = group.writes[0]!;
  const parsed = InitialSetupDispositionSchema.safeParse(w.value);
  if (!parsed.success)
    return refuse("SCHEMA", "the Disposition violates its strict contract", { key: w.key });
  const d = parsed.data;
  if (w.key !== initialSetupDispositionKey(d.world_id, d.locus_id, d.setup_id))
    return reject("REFERENCE_INVALID", "the Disposition is at the key its session derives", {
      key: w.key,
    });
  const index = scanInitialSetup(state.facts);
  const session = sessionOf(index, d.setup_id);
  if (!session) return reject("PREREQUISITE_MISSING", "the Disposition's session has no Input");
  if (index.completion || session.disposition)
    return reject(
      "REFERENCE_INVALID",
      "at most one terminal non-completion disposition per session, and none after a Completion",
      {
        reason: "SESSION_TERMINAL",
      },
    );
  if (!factAt(state, d.input) || factAt(state, d.input) !== session.input)
    return reject("REFERENCE_INVALID", "the Disposition names another Input");
  const pins: Pin[] = [d.input];
  const phaseFact = (phase: SetupPhase) =>
    phase === "SCOPE"
      ? session.scopeReservation
      : index.sceneReservation &&
          InitialSetupInvocationSchema.parse(index.sceneReservation.value).setup_id === d.setup_id
        ? index.sceneReservation
        : undefined;
  const responseFor = (phase: SetupPhase) =>
    phase === "SCOPE" ? session.scopeResponse : session.sceneResponse;
  const needResponse = (phase: SetupPhase | null): InitialSetupResponse | Rejection => {
    if (phase === null || d.response === null)
      return refuse("RESPONSE", "this disposition cites the retained response it follows");
    const f = factAt(state, d.response);
    if (!f || f !== responseFor(phase))
      return reject(
        "PREREQUISITE_MISSING",
        "the cited response is not this session's retained response",
      );
    pins.push(d.response);
    return InitialSetupResponseSchema.parse(f.value);
  };
  switch (d.reason) {
    case "CANCELLED_BEFORE_RESERVATION": {
      // checked under the same commit serialization that admits reservations: canonical absence of the relevant reservation
      if (d.response !== null || d.phase === null || d.rejection_code !== null)
        return refuse(
          "SHAPE",
          "a cancellation before reservation cites the phase whose reservation is absent and no response",
        );
      if (phaseFact(d.phase))
        return reject(
          "REFERENCE_INVALID",
          "a reservation exists: the Input can only be parked, never cancelled",
          { reason: "RESERVATION_EXISTS" },
        );
      if (d.phase === "SCENE" && !session.grant)
        return reject("REFERENCE_INVALID", "no grant exists for a SCENE-phase cancellation");
      break;
    }
    case "PARKED_UNKNOWN": {
      if (d.response !== null || d.phase === null || d.rejection_code !== null)
        return refuse(
          "SHAPE",
          "a park cites the phase whose reservation is unresolved and no response",
        );
      if (!phaseFact(d.phase))
        return reject(
          "REFERENCE_INVALID",
          "PARKED_UNKNOWN requires an existing unresolved reservation",
        );
      if (responseFor(d.phase))
        return reject(
          "REFERENCE_INVALID",
          "a retained response exists: the reservation is not unresolved",
        );
      break;
    }
    case "MIXED_INPUT":
    case "SCOPE_REFUSED": {
      if (d.phase !== "SCOPE" || d.rejection_code !== null)
        return refuse("SHAPE", "a scope disposition is a SCOPE-phase result");
      const r = needResponse(d.phase);
      if ("code" in r) return r;
      const out = interpretResponse(r);
      if (!out.ok || out.value.phase !== "SCOPE")
        return reject(
          "REFERENCE_INVALID",
          "the retained SCOPE response is not a valid scope output (INVALID_OUTPUT applies)",
        );
      const scopeManifest = manifestViolation(state, r);
      if (scopeManifest) return scopeManifest;
      const input = InitialSetupInputSchema.parse(session.input.value);
      const verdict = derivedScopeVerdict(out.value.output, input, state.facts);
      if (verdict === "SCOPE_AUTHORIZED" || verdict !== d.reason)
        return reject(
          "REFERENCE_INVALID",
          `the retained scope derives ${verdict}, not ${d.reason}`,
        );
      break;
    }
    case "INVALID_OUTPUT": {
      if (d.phase === null) return refuse("SHAPE", "INVALID_OUTPUT names its phase");
      const r = needResponse(d.phase);
      if ("code" in r) return r;
      // CE-1: INVALID_OUTPUT is justified exactly when strict interpretation FAILS or the independently recomputed manifest DIFFERS
      // from the signed reported one. A well-formed answer with a matching manifest is never misfiled as invalid, and an unverifiable
      // canonical source is not a proved mismatch.
      if (!interpretResponse(r).ok) {
        if (d.rejection_code !== null)
          return refuse("SHAPE", "a parse-invalid output carries no rejection code");
        break;
      }
      const verdict = manifestVerdict(state, r);
      if (verdict === "UNVERIFIABLE")
        return reject(
          "PREREQUISITE_MISSING",
          "the context manifest cannot be verified: INVALID_OUTPUT is not proved, failing closed",
          { reason: "MANIFEST_UNVERIFIABLE" },
        );
      if (verdict === "MATCH")
        return reject("REFERENCE_INVALID", "the retained response is a valid output");
      if (d.rejection_code !== CONTEXT_MANIFEST_MISMATCH)
        return refuse(
          "SHAPE",
          `a manifest-mismatch INVALID_OUTPUT carries the rejection code ${CONTEXT_MANIFEST_MISMATCH}`,
        );
      break;
    }
    case "GENERATOR_UNRESOLVED": {
      if (d.phase !== "SCENE")
        return refuse("SHAPE", "an unresolved generator result is a SCENE-phase result");
      const r = needResponse(d.phase);
      if ("code" in r) return r;
      const out = interpretResponse(r);
      if (!out.ok || out.value.phase !== "SCENE" || out.value.output.kind !== "UNRESOLVED")
        return reject(
          "REFERENCE_INVALID",
          "the retained scene response is not an UNRESOLVED result",
        );
      const unresolvedManifest = manifestViolation(state, r);
      if (unresolvedManifest) return unresolvedManifest;
      break;
    }
    case "COMPLETION_REFUSED": {
      if (d.phase !== "SCENE" || d.rejection_code === null)
        return refuse("SHAPE", "a refused completion records its SCENE phase and the actual code");
      const r = needResponse(d.phase);
      if ("code" in r) return r;
      const out = interpretResponse(r);
      if (
        !out.ok ||
        out.value.phase !== "SCENE" ||
        out.value.output.kind !== "SELECTION" ||
        !session.grant
      )
        return reject(
          "REFERENCE_INVALID",
          "COMPLETION_REFUSED follows a valid SELECTION under an accepted grant",
        );
      const refusedManifest = manifestViolation(state, r);
      if (refusedManifest) return refusedManifest;
      const candidate = {
        world_id: d.world_id,
        locus_id: d.locus_id,
        setup_id: d.setup_id,
        input: d.input,
        grant: pinOf(session.grant),
        scene_response: d.response!,
        selection: out.value.output.selection,
        parser: r.parser,
      } as const;
      const violation = completionViolation(state, candidate);
      if (!violation || violation.code !== d.rejection_code)
        return reject(
          "REFERENCE_INVALID",
          "the recorded rejection code is not the code the pure completion validation returns",
          {
            expected: violation?.code ?? null,
          },
        );
      break;
    }
  }
  return bindingViolation(group, state, pins, "disposition sources");
}

// ---------------------------------------------------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------------------------------------------------

const SETUP_KIND_IDS: ReadonlySet<string> = new Set(INITIAL_SETUP_FACT_KIND_IDS);

/** Admission of a group in the world_initial_setup facet (and, unchanged, its historical verification). */
export function initialSetupGroupCheck(
  group: CommitGroup,
  state: CampaignState,
  policy: InitialSetupPolicy,
): Rejection | null {
  const kind = resolveKey(group.writes[0]?.key ?? "")?.kind.id;
  if (
    !kind ||
    !SETUP_KIND_IDS.has(kind) ||
    group.writes.some((w) => resolveKey(w.key)?.kind.id !== kind)
  )
    return reject(
      "KEY_NOT_ADMITTED",
      "the world_initial_setup facet writes exactly one bootstrap record kind",
    );
  switch (kind) {
    case "initial_setup_input":
      return checkInput(group, state, policy);
    case "initial_setup_invocation":
      return checkInvocation(group, state);
    case "initial_setup_response":
      return checkResponse(group, state);
    case "initial_setup_grant":
      return checkGrant(group, state);
    case "initial_locality_completion":
      return checkCompletion(group, state);
    default:
      return checkDisposition(group, state);
  }
}

const GENESIS_IDS: ReadonlySet<string> = new Set(GENESIS_KIND_IDS);

/**
 * The active-Input freeze (companion "Admission and Freeze"): while a session is active, no group may write a genesis-kind key
 * (the world, locus, source, named PC basis or an I-002 classification). Only the same session's pipeline records are exempt: they
 * are not genesis kinds. Enforced in canonical admission (so a raw `store.commit` cannot bypass it) and in historical replay. A
 * legitimate edit is queued by the trusted workflow and reported as SETUP_BUSY; it is never silently discarded or applied in flight.
 *
 * Cheap and exact for ordinary play: a group that writes no genesis-kind key returns before any scan.
 */
export function frozenBasisViolation(group: CommitGroup, state: CampaignState): Rejection | null {
  let touchesGenesis = false;
  for (const w of group.writes) {
    const resolved = resolveKey(w.key);
    if (!resolved || !GENESIS_IDS.has(resolved.kind.id)) continue;
    if (classifyFact({ key: w.key, value: w.value }) === "GENESIS") touchesGenesis = true;
  }
  if (!touchesGenesis) return null;
  const index = scanInitialSetup(state.facts);
  if (index.count === 0) return null;
  const active = activeSessions(index);
  if (active.length === 0) return null;
  return busy(
    "an active initial-setup session freezes the world, locus, source and named PC basis: the edit is queued by the trusted workflow, not applied in flight",
    { setup_id: active[0]!.setup_id },
  );
}

export { REFEREE_OP_INITIAL_DELEGATION };
