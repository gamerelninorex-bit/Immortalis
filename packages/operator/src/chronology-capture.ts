import { join } from "node:path";
import {
  CHRONOLOGY_CAPTURE_FORMAT,
  CHRONOLOGY_DOCUMENT_MAX_BYTES,
  ChronologyCaptureSchema,
  ChronologyDocumentSchema,
  canonicalJson,
  fail,
  isReservedEvidenceIdentity,
  ok,
  type AuthoredGrade,
  type ChronologyCapture,
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

  async read(
    captureRef: string,
  ): Promise<Result<ChronologyCapture | null, ChronologyCaptureErrorCode>> {
    const got = await this.#store.get(`capture:${captureRef}`);
    if (!got.ok) return got;
    if (got.value === null) return ok(null);
    const parsed = ChronologyCaptureSchema.safeParse(got.value);
    if (!parsed.success)
      return fail("STORE_CORRUPT", "a stored capture violates its strict contract");
    return ok(parsed.data);
  }

  /** Every durable capture (fail-closed on corruption). */
  async all(): Promise<Result<ChronologyCapture[], ChronologyCaptureErrorCode>> {
    const all = await this.#store.all();
    if (!all.ok) return all;
    const out: ChronologyCapture[] = [];
    for (const { record } of all.value) {
      const parsed = ChronologyCaptureSchema.safeParse(record);
      if (!parsed.success)
        return fail("STORE_CORRUPT", "a stored capture violates its strict contract");
      out.push(parsed.data);
    }
    return ok(out);
  }

  async create(capture: ChronologyCapture): Promise<Result<void, ChronologyCaptureErrorCode>> {
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

/**
 * Records the author's chronology once. Reuse of an existing valid record-only capture of the same document and a qualifying source
 * returns it WITHOUT another question. The returned capture is the complete strict record Input admission snapshots.
 */
export async function captureStartingChronology(
  ctx: CaptureContext,
  req: CaptureRequest,
): Promise<Result<ChronologyCapture, ChronologyCaptureErrorCode>> {
  const doc = ChronologyDocumentSchema.safeParse(req.document);
  if (!doc.success)
    return fail(
      "DOCUMENT_INVALID",
      "the chronology is not a valid strict starting chronology (no default unit, no default origin)",
    );
  if (Buffer.byteLength(canonicalJson(doc.data), "utf8") > CHRONOLOGY_DOCUMENT_MAX_BYTES)
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

  const document_hash = chronologyDocumentHash(doc.data);
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

  const withoutHash: Omit<ChronologyCapture, "capture_hash"> = {
    format: CHRONOLOGY_CAPTURE_FORMAT,
    format_version: 1,
    capture_ref: req.capture_ref,
    campaign_id: ctx.campaignId,
    document: doc.data,
    document_hash,
    grade: req.grade,
    source: req.source,
  };
  const capture: ChronologyCapture = {
    ...withoutHash,
    capture_hash: chronologyCaptureHash(withoutHash),
  };
  if (!ChronologyCaptureSchema.safeParse(capture).success)
    return fail("DOCUMENT_INVALID", "the capture violates its strict contract");

  if (req.grade === "OPERATOR_CONFIRMED_RECORD_ONLY") {
    if (!ctx.terminal)
      return fail(
        "UNRESOLVED_AUTHORITY",
        "no operator console is attached to confirm the chronology",
      );
    const subject = subjectOf({ campaign_id: ctx.campaignId, document: doc.data });
    const token = await requestOperatorConfirmation(ctx.terminal, "capture-chronology", subject, [
      "STARTING CHRONOLOGY — OUT OF CHARACTER; recorded ONLY. No canonical time is established and no time passes.",
      JSON.stringify(doc.data, null, 2),
      "These are the setting author's own words and coordinate. Nothing is defaulted or estimated.",
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
      if (again.ok && again.value && again.value.capture_hash === capture.capture_hash)
        return ok(again.value);
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
  capture: ChronologyCapture,
): Promise<Result<ChronologyCapture, ChronologyCaptureErrorCode>> {
  const parsed = ChronologyCaptureSchema.safeParse(capture);
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
