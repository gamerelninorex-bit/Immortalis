import { join } from "node:path";
import {
  CHRONOLOGY_CAPTURE_FORMAT,
  CHRONOLOGY_DOCUMENT_FORMAT,
  CHRONOLOGY_DOCUMENT_MAX_BYTES,
  ChronologyDocumentSchema,
  ChronologyDocumentV2Schema,
  ChronologyEvidenceSchema,
  SI_SCALE_DECLARATION,
  canonicalJson,
  fail,
  isReservedEvidenceIdentity,
  ok,
  type AuthoredGrade,
  type ChronologyCapture,
  type ChronologyCaptureV2,
  type ChronologyDocument,
  type ChronologyDocumentV2,
  type ChronologyEvidence,
  type Result,
} from "@immortalis/contracts";
import {
  chronologyCaptureHash,
  chronologyDocumentHash,
  chronologyEvidenceViolation,
  type InitialSetupPolicy,
} from "@immortalis/engine";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "./confirmation.ts";
import { ProtectedStore, type ProtectedStoreErrorCode } from "./protected-store.ts";
import type { OperatorTerminal } from "./terminal.ts";
import type { FsOps } from "@immortalis/engine";

/**
 * The record-only chronology capture (Initial Locality Bootstrap v0.9, companion "Record-only Chronology Capture").
 *
 * `captureStartingChronology` records the proposed AUTHOR chronology — the complete StartingChronology document, its exact hash and
 * a durable source proof — and NOTHING else. It takes no campaign store, so it cannot call `initializeTime`/`establishCanonicalTime`,
 * write `temporal/state`, advance time or create a Temporal fact. It is not the existing `state_starting_moment`/CHRONOLOGY path,
 * which writes time and therefore cannot substitute for it (an origin written there makes a fresh route ineligible).
 *
 * Source grades: ORIGINAL_MESSAGE_VERIFIED needs the actual trusted original-message intake (UNBUILT in this handoff — see
 * `UnavailableEvidenceVerifier`); OPERATOR_CONFIRMED_RECORD_ONLY is the new record-only confirmation that shows the whole document to
 * the actual operator once and durably records the acceptance BEFORE consuming its ephemeral token; TOOL_CALL_ONLY is caller
 * authentication plus model-formed arguments only, capturable for diagnostics/T1 but never qualifying live Input admission.
 *
 * Two strict arms (CAL-TIME T-1, F-014B A1-1; T1 MECHANISM ONLY). A version 1 request names the whole document and takes exactly the path
 * it always took. A version 2 request (`CaptureRequestV2`) carries only the author's own statement, coordinate and unit plus the author's
 * declaration that one canonical unit is one SI second; the operator derives the document's format, version and scale, the hashes, the
 * campaign binding and the capture envelope. There is NO default scale and NO default unit: a request without the declaration is
 * refused, never turned into a version 2 (and never into a version 1). The grade is still established only by its own mechanism, so a
 * confirmation is never authorship of the original message and a model-formed call never rises above TOOL_CALL_ONLY.
 */
export type ChronologyCaptureErrorCode =
  | "DOCUMENT_INVALID"
  | "DOCUMENT_OVERSIZE"
  | "UNRESOLVED_AUTHORITY"
  | "DECLINED"
  | "RESERVED_NAMESPACE"
  | "CAPTURE_CONFLICT"
  | ProtectedStoreErrorCode;

/** What a verifier must establish about a source proof. Pure data in, a verdict out; never a model's assertion. */
export interface SourceProofClaim {
  readonly method_id: string;
  readonly client: string;
  readonly oauth_grant: string;
  readonly request_ref: string;
  readonly original_message_hash: string | null;
  readonly attestation_hash: string;
}

/**
 * The trusted original-message evidence boundary. NO genuine production message-proof method is selected by this handoff, so the
 * production implementation is `UnavailableEvidenceVerifier`, which refuses with the actual unresolved-authority result. The
 * synthetic implementation lives only in the T1 test support and reports tier T1.
 */
export interface EvidenceVerifier {
  readonly tier: "PRODUCTION" | "T1_DOUBLE";
  verifyOriginalMessage(
    claim: SourceProofClaim & { readonly message_hash: string },
  ): Promise<boolean>;
}

export const UnavailableEvidenceVerifier: EvidenceVerifier = Object.freeze({
  tier: "PRODUCTION" as const,
  verifyOriginalMessage: async () => false,
});

export interface CaptureRequest {
  readonly capture_ref: string;
  readonly document: unknown;
  readonly grade: AuthoredGrade;
  readonly source: Omit<ChronologyCapture["source"], "attestation_hash"> & {
    readonly attestation_hash: string;
  };
}

/**
 * The version 2 request: the author's own words and the author's SI declaration, nothing else. The caller names no `format`,
 * `format_version`, `scale`, hash, campaign or envelope member (an extra member in `authored` is refused); `declares_one_si_second_per_unit`
 * must be exactly `true`, so an absent, false or otherwise-spelled declaration is refused. `grade` and `source` mean exactly what they
 * mean for a version 1 request: the grade still has to be established by its own mechanism.
 */
export interface CaptureRequestV2 {
  readonly capture_ref: string;
  readonly authored: {
    readonly statement: string;
    readonly value: number;
    readonly unit: string;
  };
  readonly declares_one_si_second_per_unit: true;
  readonly grade: AuthoredGrade;
  readonly source: CaptureRequest["source"];
}

export class ChronologyCaptureStore {
  readonly #store: ProtectedStore;
  constructor(params: { readonly dir: string; readonly macKey: Buffer; readonly fs?: FsOps }) {
    this.#store = new ProtectedStore({
      dir: join(params.dir, "chronology-captures"),
      format: "immortalis-chronology-capture-store",
      macKey: params.macKey,
      ...(params.fs ? { fs: params.fs } : {}),
    });
  }

  /** A stored record is read back under the strict two-arm union: either exact arm, nothing else, no extra member. */
  async read(
    captureRef: string,
  ): Promise<Result<ChronologyEvidence | null, ChronologyCaptureErrorCode>> {
    const got = await this.#store.get(`capture:${captureRef}`);
    if (!got.ok) return got;
    if (got.value === null) return ok(null);
    const parsed = ChronologyEvidenceSchema.safeParse(got.value);
    if (!parsed.success)
      return fail("STORE_CORRUPT", "a stored capture violates its strict contract");
    return ok(parsed.data);
  }

  /** Every durable capture (fail-closed on corruption). */
  async all(): Promise<Result<ChronologyEvidence[], ChronologyCaptureErrorCode>> {
    const all = await this.#store.all();
    if (!all.ok) return all;
    const out: ChronologyEvidence[] = [];
    for (const { record } of all.value) {
      const parsed = ChronologyEvidenceSchema.safeParse(record);
      if (!parsed.success)
        return fail("STORE_CORRUPT", "a stored capture violates its strict contract");
      out.push(parsed.data);
    }
    return ok(out);
  }

  async create(capture: ChronologyEvidence): Promise<Result<void, ChronologyCaptureErrorCode>> {
    return this.#store.create(`capture:${capture.capture_ref}`, capture);
  }
}

const qualifiesChronology = (g: AuthoredGrade): boolean =>
  g === "ORIGINAL_MESSAGE_VERIFIED" || g === "OPERATOR_CONFIRMED_RECORD_ONLY";

export interface CaptureContext {
  readonly campaignId: string;
  readonly store: ChronologyCaptureStore;
  readonly verifier: EvidenceVerifier;
  readonly policy: InitialSetupPolicy;
  /** required only for OPERATOR_CONFIRMED_RECORD_ONLY: the actual operator console */
  readonly terminal?: OperatorTerminal;
}

type DerivedDocument =
  | { readonly arm: 1; readonly document: ChronologyDocument }
  | { readonly arm: 2; readonly document: ChronologyDocumentV2 };

const isV2Request = (req: CaptureRequest | CaptureRequestV2): req is CaptureRequestV2 =>
  Object.hasOwn(req, "authored");

/**
 * The chronology document of a request. A version 1 request names the whole document and it is parsed strictly, exactly as it always
 * was. A version 2 request names only the author's statement, coordinate and unit and the author's declaration; the document's format,
 * version and scale are derived HERE. Nothing is defaulted: an absent declaration, an extra or missing authored member, or a document
 * the strict version 2 schema refuses is a refusal, never a version 2 and never a quietly demoted version 1.
 */
function deriveDocument(
  req: CaptureRequest | CaptureRequestV2,
): Result<DerivedDocument, ChronologyCaptureErrorCode> {
  if (!isV2Request(req)) {
    const doc = ChronologyDocumentSchema.safeParse(req.document);
    if (!doc.success)
      return fail(
        "DOCUMENT_INVALID",
        "the chronology is not a valid strict starting chronology (no default unit, no default origin)",
      );
    return ok({ arm: 1, document: doc.data });
  }
  if (Object.hasOwn(req, "document"))
    return fail(
      "DOCUMENT_INVALID",
      "a capture request names its chronology exactly once: the authored words, or a version 1 document",
    );
  if (req.declares_one_si_second_per_unit !== true)
    return fail(
      "DOCUMENT_INVALID",
      "a version 2 chronology needs the author's own declaration of one SI second per canonical unit: no scale is defaulted",
    );
  const authored: unknown = req.authored;
  if (
    typeof authored !== "object" ||
    authored === null ||
    Array.isArray(authored) ||
    Object.keys(authored).sort().join() !== "statement,unit,value"
  )
    return fail(
      "DOCUMENT_INVALID",
      "the authored chronology is exactly {statement, value, unit}: the operator derives every other member and nothing is defaulted",
    );
  const doc = ChronologyDocumentV2Schema.safeParse({
    format: CHRONOLOGY_DOCUMENT_FORMAT,
    format_version: 2,
    time: { unit: req.authored.unit, value: req.authored.value },
    statement: req.authored.statement,
    scale: SI_SCALE_DECLARATION,
  });
  if (!doc.success)
    return fail(
      "DOCUMENT_INVALID",
      "the authored chronology is not a valid strict version 2 starting chronology (no default unit, no default origin, no default scale)",
    );
  return ok({ arm: 2, document: doc.data });
}

const sealV1 = (w: Omit<ChronologyCapture, "capture_hash">): ChronologyCapture => ({
  ...w,
  capture_hash: chronologyCaptureHash(w),
});
const sealV2 = (w: Omit<ChronologyCaptureV2, "capture_hash">): ChronologyCaptureV2 => ({
  ...w,
  capture_hash: chronologyCaptureHash(w),
});

/**
 * Records the author's chronology once. Reuse of an existing valid record-only capture of the same document and a qualifying source
 * returns it WITHOUT another question. The returned capture is the complete strict record Input admission snapshots. A version 1 request
 * returns a version 1 capture and a version 2 request a version 2 capture; the two never share a document hash, so neither reuses the other.
 */
export function captureStartingChronology(
  ctx: CaptureContext,
  req: CaptureRequest,
): Promise<Result<ChronologyCapture, ChronologyCaptureErrorCode>>;
export function captureStartingChronology(
  ctx: CaptureContext,
  req: CaptureRequestV2,
): Promise<Result<ChronologyCaptureV2, ChronologyCaptureErrorCode>>;
export function captureStartingChronology(
  ctx: CaptureContext,
  req: CaptureRequest | CaptureRequestV2,
): Promise<Result<ChronologyEvidence, ChronologyCaptureErrorCode>>;
export async function captureStartingChronology(
  ctx: CaptureContext,
  req: CaptureRequest | CaptureRequestV2,
): Promise<Result<ChronologyEvidence, ChronologyCaptureErrorCode>> {
  const derived = deriveDocument(req);
  if (!derived.ok) return derived;
  const { document } = derived.value;
  if (Buffer.byteLength(canonicalJson(document), "utf8") > CHRONOLOGY_DOCUMENT_MAX_BYTES)
    return fail("DOCUMENT_OVERSIZE", "the chronology document exceeds its transport bound");
  const synthetic = isReservedEvidenceIdentity(req.source.method_id);
  if (synthetic && ctx.policy.syntheticEvidence === "REJECT")
    return fail(
      "RESERVED_NAMESPACE",
      "the reserved synthetic-evidence namespace is rejected by production capture",
    );
  if (!synthetic && ctx.policy.syntheticEvidence === "REQUIRE")
    return fail(
      "RESERVED_NAMESPACE",
      "the synthetic-evidence capture accepts only namespaced methods",
    );

  const document_hash = chronologyDocumentHash(document);
  const existing = await ctx.store.all();
  if (!existing.ok) return existing;
  const reusable = existing.value.find(
    (c) =>
      c.campaign_id === ctx.campaignId &&
      c.document_hash === document_hash &&
      qualifiesChronology(c.grade) &&
      c.grade === req.grade,
  );
  if (reusable) return ok(reusable);

  if (req.grade === "ORIGINAL_MESSAGE_VERIFIED") {
    if (req.source.original_message_hash === null)
      return fail(
        "UNRESOLVED_AUTHORITY",
        "an original-message grade names the original message it maps to",
      );
    const verified = await ctx.verifier.verifyOriginalMessage({
      ...req.source,
      message_hash: req.source.original_message_hash,
    });
    if (!verified)
      return fail(
        "UNRESOLVED_AUTHORITY",
        "no trusted original-message intake verifies this proof: the actual unresolved-authority result, not a guessed time",
      );
  }

  const capture: ChronologyEvidence =
    derived.value.arm === 1
      ? sealV1({
          format: CHRONOLOGY_CAPTURE_FORMAT,
          format_version: 1,
          capture_ref: req.capture_ref,
          campaign_id: ctx.campaignId,
          document: derived.value.document,
          document_hash,
          grade: req.grade,
          source: req.source,
        })
      : sealV2({
          format: CHRONOLOGY_CAPTURE_FORMAT,
          format_version: 2,
          capture_ref: req.capture_ref,
          campaign_id: ctx.campaignId,
          document: derived.value.document,
          document_hash,
          grade: req.grade,
          source: req.source,
        });
  if (!ChronologyEvidenceSchema.safeParse(capture).success)
    return fail("DOCUMENT_INVALID", "the capture violates its strict contract");

  if (req.grade === "OPERATOR_CONFIRMED_RECORD_ONLY") {
    if (!ctx.terminal)
      return fail(
        "UNRESOLVED_AUTHORITY",
        "no operator console is attached to confirm the chronology",
      );
    const subject = subjectOf({ campaign_id: ctx.campaignId, document });
    const token = await requestOperatorConfirmation(ctx.terminal, "capture-chronology", subject, [
      "STARTING CHRONOLOGY — OUT OF CHARACTER; recorded ONLY. No canonical time is established and no time passes.",
      JSON.stringify(document, null, 2),
      derived.value.arm === 1
        ? "These are the setting author's own words and coordinate. Nothing is defaulted or estimated."
        : "These are the setting author's own words, coordinate and declared scale (one canonical unit is exactly one SI second). Nothing is defaulted or estimated.",
    ]);
    if (!token) return fail("DECLINED", "not confirmed; nothing was recorded");
    // the acceptance is durable BEFORE the ephemeral token is consumed: the in-memory token is never the durable proof
    const stored = await ctx.store.create(capture);
    if (!stored.ok) return stored;
    if (!consumeConfirmation(token, "capture-chronology", subject))
      return fail("DECLINED", "the confirmation could not be consumed");
    return ok(capture);
  }

  const stored = await ctx.store.create(capture);
  if (!stored.ok) {
    if (stored.error.code === "STORE_EXISTS") {
      const again = await ctx.store.read(req.capture_ref);
      if (!again.ok) return again;
      if (again.value && again.value.capture_hash === capture.capture_hash) return ok(again.value);
      return fail("CAPTURE_CONFLICT", "this capture reference already holds a different capture");
    }
    return stored;
  }
  return ok(capture);
}

/**
 * Trusted-intake verification of a capture before an Input is built from it: the exact campaign, document and hashes, the grade, the
 * synthetic-evidence policy, and (for the original-message grade) the verifier's durable-proof check. Copied fields, a bare caller identity or a
 * consumed in-memory confirmation are insufficient.
 */
export async function verifyCaptureForIntake(
  ctx: Pick<CaptureContext, "campaignId" | "verifier" | "policy">,
  capture: ChronologyEvidence,
): Promise<Result<ChronologyEvidence, ChronologyCaptureErrorCode>> {
  const parsed = ChronologyEvidenceSchema.safeParse(capture);
  if (!parsed.success) return fail("DOCUMENT_INVALID", "the capture violates its strict contract");
  const synthetic = isReservedEvidenceIdentity(capture.source.method_id);
  if (synthetic && ctx.policy.syntheticEvidence === "REJECT")
    return fail(
      "RESERVED_NAMESPACE",
      "the reserved synthetic-evidence namespace is rejected by production intake",
    );
  const bad = chronologyEvidenceViolation(capture, ctx.campaignId);
  if (bad) return fail("DOCUMENT_INVALID", bad.message);
  if (capture.grade === "ORIGINAL_MESSAGE_VERIFIED") {
    const verified = await ctx.verifier.verifyOriginalMessage({
      ...capture.source,
      message_hash: capture.source.original_message_hash!,
    });
    if (!verified)
      return fail("UNRESOLVED_AUTHORITY", "the durable original-message proof does not verify");
  }
  return ok(capture);
}
