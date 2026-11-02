import { z } from "zod";
import { Id, Sha256, Version } from "./ids.ts";
import { fail, ok, type Result } from "./result.ts";
import { CanonicalTimeSchema } from "./temporal.ts";
import { EntityId, Text } from "./world-foundation.ts";

/**
 * IMMORTALIS Initial Locality Bootstrap v0.9 — executable contract (CORE_V9 + OPTION_A_V9, both ADOPTED by the Sovereign's
 * ratification of 2026-11-02T15:46:21.719Z).
 *
 * Source: the paired v0.9 semantic source (native pin 2026-11-01T12:13:42.692Z) and its complete executable companion (native pin
 * 2026-11-01T12:13:53.634Z). The companion is the literal schema authority; every shape below is the companion's, not a paraphrase.
 * All objects are strict, every required field is present, union branches reject foreign fields. Nothing here selects a production
 * message-proof method or an isolation-capable model driver: those remain external prerequisites (T2/T3, OB-030).
 */

export const INITIAL_LOCALITY_PARSER_V1 = "INITIAL_LOCALITY_PARSER_V1";
export const INITIAL_SETUP_FORMAT_VERSION = 1;

/** Technical transport bounds (NOT game limits): oversize is an availability limit owned by OB-030, never a truncation. */
export const SETUP_MESSAGE_MAX_BYTES = 65_536;
export const CHRONOLOGY_DOCUMENT_MAX_BYTES = 65_536;
export const RAW_RESPONSE_MAX_BYTES = 262_144;
export const PRODUCER_INPUT_MAX_BYTES = 2_097_152;

/** The reserved namespace for synthetic evidence. Production capture/Input verification, startup, load and replay reject it. */
export const FIXTURE_NAMESPACE_PREFIX = "fixture:";
export const isFixtureIdentity = (id: string): boolean => id.startsWith(FIXTURE_NAMESPACE_PREFIX);
/** The production-facing name: production code refers to the reserved synthetic-evidence namespace, never to fixtures. */
export const isReservedEvidenceIdentity = isFixtureIdentity;

// ---------------------------------------------------------------------------------------------------------------------
// Owners, facets, kinds, keys
// ---------------------------------------------------------------------------------------------------------------------

/** New facet of the existing World-State owner (IM-03/RC-02). */
export const FACET_WORLD_INITIAL_SETUP = "world_initial_setup";

export const INITIAL_SETUP_FACT_KIND_IDS = [
  "initial_setup_input",
  "initial_setup_invocation",
  "initial_setup_response",
  "initial_setup_grant",
  "initial_locality_completion",
  "initial_setup_disposition",
] as const;
export type InitialSetupFactKindId = (typeof INITIAL_SETUP_FACT_KIND_IDS)[number];

export const SETUP_PHASES = ["SCOPE", "SCENE"] as const;
export const SetupPhaseSchema = z.enum(SETUP_PHASES);
export type SetupPhase = z.infer<typeof SetupPhaseSchema>;

const initialSetupRoot = (worldId: string, locusId: string): string =>
  `world/${worldId}/locus/${locusId}/initial-setup`;
export const initialSetupInputKey = (worldId: string, locusId: string, setupId: string): string =>
  `${initialSetupRoot(worldId, locusId)}/${setupId}/input`;
/** SCOPE: one reservation per session; SCENE: at most one per locality across all sessions (no setup id in the key). */
export const initialSetupInvocationKey = (
  worldId: string,
  locusId: string,
  phase: SetupPhase,
  setupId: string,
): string =>
  phase === "SCOPE"
    ? `${initialSetupRoot(worldId, locusId)}/${setupId}/scope-reservation`
    : `${initialSetupRoot(worldId, locusId)}/scene-reservation`;
export const initialSetupResponseKey = (
  worldId: string,
  locusId: string,
  setupId: string,
  phase: SetupPhase,
): string => `${initialSetupRoot(worldId, locusId)}/${setupId}/response/${phase}`;
export const initialSetupGrantKey = (worldId: string, locusId: string, setupId: string): string =>
  `${initialSetupRoot(worldId, locusId)}/${setupId}/grant`;
export const initialLocalityCompletionKey = (worldId: string, locusId: string): string =>
  `${initialSetupRoot(worldId, locusId)}/completion`;
export const initialSetupDispositionKey = (
  worldId: string,
  locusId: string,
  setupId: string,
): string => `${initialSetupRoot(worldId, locusId)}/${setupId}/disposition`;

// ---------------------------------------------------------------------------------------------------------------------
// Strict parser: INITIAL_LOCALITY_PARSER_V1
// ---------------------------------------------------------------------------------------------------------------------

export const PARSER_ERROR_CODES = [
  "OVERSIZE",
  "BOM_REJECTED",
  "MALFORMED_UTF8",
  "SYNTAX",
  "TRAILING_DATA",
  "DUPLICATE_KEY",
  "NON_FINITE_NUMBER",
  "UNSAFE_INTEGER",
  "LONE_SURROGATE",
  "DEPTH_EXCEEDED",
] as const;
export type ParserErrorCode = (typeof PARSER_ERROR_CODES)[number];

const MAX_DEPTH = 64;

class ParseFailure extends Error {
  readonly code: ParserErrorCode;
  constructor(code: ParserErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Strict UTF-8 JSON, no duplicate object keys (decided on the DECODED key, so `"a"` and `"a"` collide), no BOM, no trailing
 * data, no non-finite or unsafe-integer numbers, no unpaired surrogate escapes. `JSON.parse` alone is insufficient: it silently keeps
 * the last duplicate. Objects are plain (a `__proto__` key becomes an own property, never a prototype).
 */
class StrictJsonParser {
  readonly #s: string;
  #i = 0;
  constructor(text: string) {
    this.#s = text;
  }
  parseDocument(): unknown {
    this.#ws();
    const v = this.#value(0);
    this.#ws();
    if (this.#i !== this.#s.length)
      throw new ParseFailure("TRAILING_DATA", "data follows the JSON value");
    return v;
  }
  #ws(): void {
    while (this.#i < this.#s.length) {
      const c = this.#s.charCodeAt(this.#i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) this.#i++;
      else break;
    }
  }
  #err(message: string): never {
    throw new ParseFailure("SYNTAX", `${message} at offset ${this.#i}`);
  }
  #value(depth: number): unknown {
    if (depth > MAX_DEPTH) throw new ParseFailure("DEPTH_EXCEEDED", "nesting is too deep");
    const c = this.#s[this.#i];
    if (c === "{") return this.#object(depth);
    if (c === "[") return this.#array(depth);
    if (c === '"') return this.#string();
    if (c === "t") return this.#literal("true", true);
    if (c === "f") return this.#literal("false", false);
    if (c === "n") return this.#literal("null", null);
    if (c === "-" || (c !== undefined && c >= "0" && c <= "9")) return this.#number();
    return this.#err("unexpected token");
  }
  #literal<T>(word: string, value: T): T {
    if (this.#s.startsWith(word, this.#i)) {
      this.#i += word.length;
      return value;
    }
    return this.#err("invalid literal");
  }
  #number(): number {
    const m = /^-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(this.#s.slice(this.#i));
    if (!m) return this.#err("invalid number");
    this.#i += m[0].length;
    const n = Number(m[0]);
    if (!Number.isFinite(n)) throw new ParseFailure("NON_FINITE_NUMBER", "number overflows");
    if (m[1] === undefined && m[2] === undefined && !Number.isSafeInteger(n))
      throw new ParseFailure("UNSAFE_INTEGER", "integer exceeds the safe range");
    return n;
  }
  #string(): string {
    this.#i++; // opening quote
    let out = "";
    for (;;) {
      if (this.#i >= this.#s.length) return this.#err("unterminated string");
      const c = this.#s.charCodeAt(this.#i);
      if (c === 0x22) {
        this.#i++;
        return out;
      }
      if (c < 0x20) return this.#err("control character in string");
      if (c === 0x5c) {
        const e = this.#s[this.#i + 1];
        this.#i += 2;
        switch (e) {
          case '"':
            out += '"';
            break;
          case "\\":
            out += "\\";
            break;
          case "/":
            out += "/";
            break;
          case "b":
            out += "\b";
            break;
          case "f":
            out += "\f";
            break;
          case "n":
            out += "\n";
            break;
          case "r":
            out += "\r";
            break;
          case "t":
            out += "\t";
            break;
          case "u": {
            const unit = this.#hex4();
            if (unit >= 0xd800 && unit <= 0xdbff) {
              if (this.#s[this.#i] === "\\" && this.#s[this.#i + 1] === "u") {
                this.#i += 2;
                const low = this.#hex4();
                if (low < 0xdc00 || low > 0xdfff)
                  throw new ParseFailure("LONE_SURROGATE", "unpaired high surrogate escape");
                out += String.fromCharCode(unit, low);
              } else throw new ParseFailure("LONE_SURROGATE", "unpaired high surrogate escape");
            } else if (unit >= 0xdc00 && unit <= 0xdfff) {
              throw new ParseFailure("LONE_SURROGATE", "unpaired low surrogate escape");
            } else out += String.fromCharCode(unit);
            break;
          }
          default:
            return this.#err("invalid escape");
        }
        continue;
      }
      out += this.#s[this.#i];
      this.#i++;
    }
  }
  #hex4(): number {
    const h = this.#s.slice(this.#i, this.#i + 4);
    if (!/^[0-9a-fA-F]{4}$/.test(h)) return this.#err("invalid unicode escape");
    this.#i += 4;
    return parseInt(h, 16);
  }
  #array(depth: number): unknown[] {
    this.#i++;
    const out: unknown[] = [];
    this.#ws();
    if (this.#s[this.#i] === "]") {
      this.#i++;
      return out;
    }
    for (;;) {
      this.#ws();
      out.push(this.#value(depth + 1));
      this.#ws();
      const c = this.#s[this.#i];
      if (c === ",") {
        this.#i++;
        continue;
      }
      if (c === "]") {
        this.#i++;
        return out;
      }
      return this.#err("expected , or ]");
    }
  }
  #object(depth: number): Record<string, unknown> {
    this.#i++;
    const out: Record<string, unknown> = {};
    const seen = new Set<string>();
    this.#ws();
    if (this.#s[this.#i] === "}") {
      this.#i++;
      return out;
    }
    for (;;) {
      this.#ws();
      if (this.#s[this.#i] !== '"') return this.#err("expected a string key");
      const key = this.#string();
      if (seen.has(key)) throw new ParseFailure("DUPLICATE_KEY", `duplicate key "${key}"`);
      seen.add(key);
      this.#ws();
      if (this.#s[this.#i] !== ":") return this.#err("expected :");
      this.#i++;
      this.#ws();
      Object.defineProperty(out, key, {
        value: this.#value(depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
      this.#ws();
      const c = this.#s[this.#i];
      if (c === ",") {
        this.#i++;
        continue;
      }
      if (c === "}") {
        this.#i++;
        return out;
      }
      return this.#err("expected , or }");
    }
  }
}

/** Parses exact bytes under INITIAL_LOCALITY_PARSER_V1. The same bytes always yield the same normalized value or the same refusal. */
export function parseInitialLocalityJson(
  bytes: Uint8Array,
  maxBytes: number,
): Result<unknown, ParserErrorCode> {
  if (bytes.length > maxBytes) return fail("OVERSIZE", `input exceeds ${maxBytes} bytes`);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return fail("BOM_REJECTED", "a byte-order mark is rejected");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return fail("MALFORMED_UTF8", "the bytes are not well-formed UTF-8");
  }
  try {
    return ok(new StrictJsonParser(text).parseDocument());
  } catch (e) {
    if (e instanceof ParseFailure) return fail(e.code, e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Common values
// ---------------------------------------------------------------------------------------------------------------------

/** Pin is exactly {fact_key, version}: a committed historical version, never "latest". */
export const PinSchema = z.strictObject({ fact_key: Id, version: Version.min(1) });
export type Pin = z.infer<typeof PinSchema>;

const sortedUniqueBy =
  <T>(key: (t: T) => string) =>
  (a: readonly T[]): boolean => {
    for (let i = 1; i < a.length; i++) if (!(key(a[i - 1]!) < key(a[i]!))) return false;
    return true;
  };
const pinKey = (p: Pin): string => `${p.fact_key}@${String(p.version).padStart(16, "0")}`;
/** A set of pins: lexically sorted and unique. */
export const PinSetSchema = z
  .array(PinSchema)
  .refine(sortedUniqueBy(pinKey), "pins must be a lexically sorted unique set");
/** A set of quotes: lexically sorted and unique. */
export const QuoteSetSchema = z.array(Text).refine(
  sortedUniqueBy((t: string) => t),
  "quotes must be a lexically sorted unique set",
);

export const AUTHORED_GRADES = [
  "ORIGINAL_MESSAGE_VERIFIED",
  "OPERATOR_CONFIRMED_RECORD_ONLY",
  "TOOL_CALL_ONLY",
] as const;
export const AuthoredGradeSchema = z.enum(AUTHORED_GRADES);
export type AuthoredGrade = z.infer<typeof AuthoredGradeSchema>;

export const CHRONOLOGY_DOCUMENT_FORMAT = "immortalis-starting-chronology";
/**
 * The strict author-only chronology document embedded in a record-only capture. It is structurally IDENTICAL to the operator's
 * existing `StartingChronologySchema` (which stays byte-for-byte untouched, preserving the legacy initialization path); a contract
 * test asserts the two accept and refuse exactly the same documents.
 */
export const ChronologyDocumentSchema = z.strictObject({
  format: z.literal(CHRONOLOGY_DOCUMENT_FORMAT),
  format_version: z.literal(1),
  time: CanonicalTimeSchema,
  statement: Text,
});
export type ChronologyDocument = z.infer<typeof ChronologyDocumentSchema>;

/** Only ORIGINAL_MESSAGE_VERIFIED qualifies Input.author (the setup message). */
export const AuthoredEvidenceSchema = z.strictObject({
  grade: AuthoredGradeSchema,
  client: Id,
  oauth_grant: Id,
  request_ref: Id,
  original_message_hash: Sha256.nullable(),
  method_id: Id,
  proof_hash: Sha256,
});
export type AuthoredEvidence = z.infer<typeof AuthoredEvidenceSchema>;

export const CHRONOLOGY_CAPTURE_FORMAT = "immortalis-record-only-chronology";
/** Record-only chronology capture. It writes no temporal/state, advances no time and creates no Temporal fact. */
export const ChronologyCaptureSchema = z.strictObject({
  format: z.literal(CHRONOLOGY_CAPTURE_FORMAT),
  format_version: z.literal(1),
  capture_ref: Id,
  campaign_id: Id,
  document: ChronologyDocumentSchema,
  document_hash: Sha256,
  grade: AuthoredGradeSchema,
  source: z.strictObject({
    client: Id,
    oauth_grant: Id,
    request_ref: Id,
    original_message_hash: Sha256.nullable(),
    method_id: Id,
    attestation_hash: Sha256,
  }),
  capture_hash: Sha256,
});
export type ChronologyCapture = z.infer<typeof ChronologyCaptureSchema>;
/** ChronologyEvidence is the complete strict record-only capture, including its verified source grade. */
export const ChronologyEvidenceSchema = ChronologyCaptureSchema;
export type ChronologyEvidence = ChronologyCapture;

export const RUNNER_ID = "initial-locality-runner-v1";
export const RunnerPinSchema = z.strictObject({
  runner_id: z.literal(RUNNER_ID),
  key_id: Id,
  public_key: Text,
  instruction_hash: Sha256,
  driver_id: Id,
  driver_config_hash: Sha256,
});
export type RunnerPin = z.infer<typeof RunnerPinSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// Canonical records
// ---------------------------------------------------------------------------------------------------------------------

export const INITIAL_SETUP_INPUT_FORMAT = "immortalis-initial-setup-input";
export const InitialSetupInputSchema = z.strictObject({
  format: z.literal(INITIAL_SETUP_INPUT_FORMAT),
  format_version: z.literal(1),
  world_id: EntityId,
  locus_id: EntityId,
  source: PinSchema,
  pc: PinSchema.nullable(),
  setup_id: Sha256,
  scope_fingerprint: Sha256,
  setup_message: Text,
  author: AuthoredEvidenceSchema,
  chronology: ChronologyEvidenceSchema,
  genesis: PinSetSchema,
  projection_hash: Sha256,
  pre_state: z.strictObject({ head: Id, basis_hash: Sha256 }),
  runner: RunnerPinSchema,
  parser: z.literal(INITIAL_LOCALITY_PARSER_V1),
});
export type InitialSetupInput = z.infer<typeof InitialSetupInputSchema>;

export const InitialSetupInvocationSchema = z.strictObject({
  world_id: EntityId,
  locus_id: EntityId,
  setup_id: Sha256,
  input: PinSchema,
  phase: SetupPhaseSchema,
  task_id: Sha256,
  input_hash: Sha256,
  parser: z.literal(INITIAL_LOCALITY_PARSER_V1),
  grant: PinSchema.nullable(),
});
export type InitialSetupInvocation = z.infer<typeof InitialSetupInvocationSchema>;

export const RUNNER_RESULT_FORMAT = "immortalis-initial-runner-result";
export const SignedEnvelopeBodySchema = z.strictObject({
  format: z.literal(RUNNER_RESULT_FORMAT),
  format_version: z.literal(1),
  runner_id: z.literal(RUNNER_ID),
  key_id: Id,
  campaign_id: Id,
  world_id: EntityId,
  locus_id: EntityId,
  setup_id: Sha256,
  phase: SetupPhaseSchema,
  task_id: Sha256,
  reservation: PinSchema,
  input_hash: Sha256,
  projection_hash: Sha256,
  instruction_hash: Sha256,
  driver_id: Id,
  driver_config_hash: Sha256,
  context_manifest_hash: Sha256,
  parser: z.literal(INITIAL_LOCALITY_PARSER_V1),
  raw_response_hash: Sha256,
});
export type SignedEnvelopeBody = z.infer<typeof SignedEnvelopeBodySchema>;
export const SignedEnvelopeSchema = z.strictObject({
  body: SignedEnvelopeBodySchema,
  signature: Text,
});
export type SignedEnvelope = z.infer<typeof SignedEnvelopeSchema>;

export const InitialSetupResponseSchema = z.strictObject({
  world_id: EntityId,
  locus_id: EntityId,
  setup_id: Sha256,
  reservation: PinSchema,
  phase: SetupPhaseSchema,
  task_id: Sha256,
  input_hash: Sha256,
  raw_response_base64: Text,
  raw_response_hash: Sha256,
  envelope: SignedEnvelopeSchema,
  parser: z.literal(INITIAL_LOCALITY_PARSER_V1),
});
export type InitialSetupResponse = z.infer<typeof InitialSetupResponseSchema>;

// -- SCOPE ------------------------------------------------------------------------------------------------------------

export const CHECKLIST = [
  "DOMAIN_BOUNDARY",
  "ACTOR_COVERAGE",
  "SOURCE_CLAIMS",
  "WORKFORCE_COVERAGE",
] as const;
export const FACET_MODES = ["DELEGATED", "FIXED_BY_SOURCE", "NOT_AUTHORIZED"] as const;
export const FacetAuthoritySchema = z.strictObject({
  facet: z.enum(CHECKLIST),
  mode: z.enum(FACET_MODES),
  evidence_quotes: QuoteSetSchema,
  source_refs: PinSetSchema,
});
export type FacetAuthority = z.infer<typeof FacetAuthoritySchema>;

export const RESTRICTION_PREDICATES = [
  "NO_NON_PC_ACTORS",
  "NO_SOURCE_CLAIMS",
  "REQUIRE_CLOSED_DOMAIN",
  "REQUIRE_OPEN_DOMAIN",
] as const;
export const RestrictionSchema = z.strictObject({
  predicate: z.enum(RESTRICTION_PREDICATES),
  evidence_quote: Text,
});
export type Restriction = z.infer<typeof RestrictionSchema>;
const restrictionKey = (r: Restriction): string => `${r.predicate}\u0000${r.evidence_quote}`;
export const RestrictionSetSchema = z
  .array(RestrictionSchema)
  .refine(sortedUniqueBy(restrictionKey), "restrictions must be a sorted unique set");

/** All four facets occur once in this exact order. */
const facetsInChecklistOrder = (f: readonly FacetAuthority[]): boolean =>
  f.length === CHECKLIST.length && f.every((x, i) => x.facet === CHECKLIST[i]);
export const FacetListSchema = z
  .array(FacetAuthoritySchema)
  .refine(facetsInChecklistOrder, "all four facets occur once in checklist order");

export const MESSAGE_USES = ["SETUP_AUTHORSHIP_ONLY", "MIXED_INPUT", "UNCLEAR"] as const;
export const ScopeOutputSchema = z.strictObject({
  kind: z.literal("SCOPE"),
  task_id: Sha256,
  input_hash: Sha256,
  message_use: z.enum(MESSAGE_USES),
  facets: FacetListSchema,
  restrictions: RestrictionSetSchema,
  unhandled_constraints: z.array(Text),
  clarification: Text.nullable(),
});
export type ScopeOutput = z.infer<typeof ScopeOutputSchema>;

// -- SCENE ------------------------------------------------------------------------------------------------------------

export const PROVENANCE_ORIGINS = [
  "PLAYER_AUTHORED",
  "PLAYER_DELEGATED",
  "WORLD_COMPLETION",
  "ACTOR_DECISION",
  "ENGINE_DERIVED",
] as const;
export const ProvenanceEntrySchema = z.strictObject({
  path: Text,
  origin: z.enum(PROVENANCE_ORIGINS),
  source_refs: PinSetSchema,
  evidence_quotes: QuoteSetSchema,
  grant: PinSchema.nullable(),
});
export type ProvenanceEntry = z.infer<typeof ProvenanceEntrySchema>;

export const CLOSURE_KINDS = ["CLOSED", "OPEN", "UNRESOLVED"] as const;
export const ACTOR_KINDS = ["NONE_IN_DOMAIN", "ACTOR_PRODUCER_REQUIRED", "UNRESOLVED"] as const;
export const CLAIM_KINDS = ["NONE_ESTABLISHED", "CLAIM_REQUIRED", "UNRESOLVED"] as const;

export const SourceClaimSchema = z
  .strictObject({
    source: PinSchema,
    kind: z.enum(CLAIM_KINDS),
    claimant: Text.nullable(),
    ground: Text,
  })
  .refine(
    (c) => (c.kind === "CLAIM_REQUIRED" ? c.claimant !== null : c.claimant === null),
    "CLAIM_REQUIRED requires a nonempty claimant; the other kinds carry claimant: null",
  );

export const SelectionSchema = z.strictObject({
  domain: z.strictObject({ designation: Text, topology: Text }),
  closure: z.strictObject({ kind: z.enum(CLOSURE_KINDS), ground: Text }),
  actors: z
    .strictObject({ kind: z.enum(ACTOR_KINDS), constraints: z.array(Text), ground: Text })
    .refine(
      (a) =>
        a.kind === "NONE_IN_DOMAIN"
          ? a.constraints.length === 0
          : a.kind === "ACTOR_PRODUCER_REQUIRED"
            ? a.constraints.length >= 1
            : true,
      "NONE_IN_DOMAIN requires empty constraints; ACTOR_PRODUCER_REQUIRED requires at least one constraint",
    ),
  source_claims: z.array(SourceClaimSchema),
  workforce: z.strictObject({ scope_statement: Text }),
  coverage: z.strictObject({ start: CanonicalTimeSchema, end: CanonicalTimeSchema, ground: Text }),
  provenance: z.array(ProvenanceEntrySchema),
});
export type Selection = z.infer<typeof SelectionSchema>;

export const UNRESOLVED_REASONS_V9 = [
  "INSUFFICIENT_CONSTRAINTS",
  "INCOMPATIBLE_CONSTRAINTS",
  "UNSUPPORTED_REFERENCE",
] as const;
export const SceneOutputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("SELECTION"),
    task_id: Sha256,
    input_hash: Sha256,
    selection: SelectionSchema,
  }),
  z.strictObject({
    kind: z.literal("UNRESOLVED"),
    task_id: Sha256,
    input_hash: Sha256,
    reason: z.enum(UNRESOLVED_REASONS_V9),
    explanation: Text,
  }),
]);
export type SceneOutput = z.infer<typeof SceneOutputSchema>;

export const InitialSetupGrantSchema = z.strictObject({
  world_id: EntityId,
  locus_id: EntityId,
  setup_id: Sha256,
  input: PinSchema,
  classification: PinSchema,
  scope_response: PinSchema,
  facets: FacetListSchema,
  restrictions: RestrictionSetSchema,
  chronology_hash: Sha256,
  scope_hash: Sha256,
});
export type InitialSetupGrant = z.infer<typeof InitialSetupGrantSchema>;

export const InitialLocalityCompletionSchema = z.strictObject({
  world_id: EntityId,
  locus_id: EntityId,
  setup_id: Sha256,
  input: PinSchema,
  grant: PinSchema,
  scene_response: PinSchema,
  selection: SelectionSchema,
  parser: z.literal(INITIAL_LOCALITY_PARSER_V1),
});
export type InitialLocalityCompletion = z.infer<typeof InitialLocalityCompletionSchema>;

export const DISPOSITION_REASONS = [
  "MIXED_INPUT",
  "SCOPE_REFUSED",
  "INVALID_OUTPUT",
  "GENERATOR_UNRESOLVED",
  "COMPLETION_REFUSED",
  "CANCELLED_BEFORE_RESERVATION",
  "PARKED_UNKNOWN",
] as const;
export const InitialSetupDispositionSchema = z.strictObject({
  world_id: EntityId,
  locus_id: EntityId,
  setup_id: Sha256,
  input: PinSchema,
  reason: z.enum(DISPOSITION_REASONS),
  phase: SetupPhaseSchema.nullable(),
  response: PinSchema.nullable(),
  rejection_code: Id.nullable(),
  explanation: Text,
});
export type InitialSetupDisposition = z.infer<typeof InitialSetupDispositionSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// Referee alternate value branch: WG_INITIAL_DELEGATION_CLASSIFY (world subject; no pc_id is invented)
// ---------------------------------------------------------------------------------------------------------------------

export const REFEREE_OP_INITIAL_DELEGATION = "WG_INITIAL_DELEGATION_CLASSIFY";
export const GM_INITIAL_SCOPE_HOST_ID = "gm-initial-scope";
export const GM_INITIAL_SCOPE_CHANNEL = "PRIVATE_ISOLATED_RUNNER";
export const SCOPE_VERDICTS = ["SCOPE_AUTHORIZED", "SCOPE_REFUSED", "MIXED_INPUT"] as const;
export const ScopeDecisionRecordSchema = z.strictObject({
  record_version: z.literal(1),
  operation: z.literal(REFEREE_OP_INITIAL_DELEGATION),
  task_id: Sha256,
  campaign_id: Id,
  attempt: z.literal(0),
  authority: z.strictObject({ role: Id, permission: Id }),
  host: z.strictObject({
    host_id: z.literal(GM_INITIAL_SCOPE_HOST_ID),
    claimed_model: z.string().min(1).max(160).nullable(),
  }),
  subject: z.strictObject({ world_id: EntityId, locus_id: EntityId }),
  input: z.strictObject({
    digest: Sha256,
    setup_input: PinSchema,
    reservation: PinSchema,
    response: PinSchema,
  }),
  decision: ScopeOutputSchema,
  verdict: z.enum(SCOPE_VERDICTS),
});
export type ScopeDecisionRecord = z.infer<typeof ScopeDecisionRecordSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// Rule identities
// ---------------------------------------------------------------------------------------------------------------------

export const INITIAL_SETUP_RULE_IDS = {
  initial_setup_input: "INITIAL_SETUP_INPUT_V9_RULE",
  initial_setup_invocation: "INITIAL_SETUP_INVOCATION_V9_RULE",
  initial_setup_response: "INITIAL_SETUP_RESPONSE_V9_RULE",
  initial_setup_grant: "INITIAL_SETUP_GRANT_V9_RULE",
  initial_locality_completion: "INITIAL_LOCALITY_COMPLETION_V9_RULE",
  initial_setup_disposition: "INITIAL_SETUP_DISPOSITION_V9_RULE",
} as const satisfies Record<InitialSetupFactKindId, string>;
export const INITIAL_SETUP_SCOPE_RULE_ID = "INITIAL_SETUP_SCOPE_V9_RULE";
export const INITIAL_COMPLETION_SCENE_CLOSURE_RULE_ID = "INITIAL_COMPLETION_SCENE_CLOSURE_V9_RULE";
export const INITIAL_COMPLETION_WORKFORCE_SCOPE_RULE_ID =
  "INITIAL_COMPLETION_WORKFORCE_SCOPE_V9_RULE";
export const INITIAL_COMPLETION_OPERATION = "INITIAL_LOCALITY_COMPLETION_V9";

/** Grade-specific publication bases for the captured-chronology Temporal write. */
export const CAPTURED_CHRONOLOGY_BASIS = {
  ORIGINAL_MESSAGE_VERIFIED: "original-message-captured-starting-chronology",
  OPERATOR_CONFIRMED_RECORD_ONLY: "operator-record-only-confirmed-starting-chronology",
} as const;
