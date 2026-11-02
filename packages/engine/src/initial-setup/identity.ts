import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";
import {
  FIXTURE_NAMESPACE_PREFIX,
  canonicalJson,
  type ChronologyCapture,
  type Pin,
  type SetupPhase,
  type SignedEnvelope,
  type ChronologyDocument,
} from "@immortalis/contracts";
import { sha256Canonical, sha256Text } from "../hash.ts";

/**
 * Deterministic identities and hashes of the v0.9 Initial Locality Bootstrap records. Every function is pure; none consults a clock,
 * a random source or a mutable configuration. The formulas are the companion's.
 */

/** SHA-256 of the exact authenticated setup message (UTF-8). Input.author.original_message_hash must equal this. */
export const setupMessageHash = (message: string): string => sha256Text(message);

/** document_hash = SHA256(canonicalJson(document)) */
export const chronologyDocumentHash = (document: ChronologyDocument): string =>
  sha256Canonical(document);

/** capture_hash hashes all preceding fields except itself. */
export function chronologyCaptureHash(capture: Omit<ChronologyCapture, "capture_hash">): string {
  return sha256Canonical(capture);
}

/** setup_id = SHA256(canonicalJson({campaign_id, client, oauth_grant, authenticated_setup_request_id})): independent of any generated output. */
export const setupIdOf = (p: {
  readonly campaign_id: string;
  readonly client: string;
  readonly oauth_grant: string;
  readonly authenticated_setup_request_id: string;
}): string => sha256Canonical(p);

/** scope_fingerprint: client and request ids are deliberately absent, so changing them cannot defeat deduplication. */
export const scopeFingerprintOf = (p: {
  readonly world_id: string;
  readonly locus_id: string;
  readonly setup_message_hash: string;
  readonly projection_hash: string;
  readonly chronology_document_hash: string;
}): string => sha256Canonical(p);

/** task_id = SHA256(canonicalJson({campaign_id, setup_id, phase, input: Pin, input_hash})) */
export const taskIdOf = (p: {
  readonly campaign_id: string;
  readonly setup_id: string;
  readonly phase: SetupPhase;
  readonly input: Pin;
  readonly input_hash: string;
}): string => sha256Canonical(p);

/**
 * SHA-256 over EXACT bytes. Both the engine-produced producer input (`input_hash`) and the runner's raw answer (`raw_response_hash`)
 * are hashed as the bytes that crossed the boundary; the base64 text of a stored Response is transport, never the hashed object.
 */
export const sha256Bytes = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/**
 * Ed25519 verification of a signed runner result. The key is ALWAYS the one pinned into Input.runner.public_key — never a key the
 * answer supplies. `public_key` is a base64 DER SubjectPublicKeyInfo. Any malformed key or signature is a plain `false`.
 */
export function verifyEnvelopeSignature(
  envelope: SignedEnvelope,
  publicKeyBase64: string,
): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyBase64, "base64"),
      format: "der",
      type: "spki",
    });
    return cryptoVerify(
      null,
      Buffer.from(canonicalJson(envelope.body), "utf8"),
      key,
      Buffer.from(envelope.signature, "base64"),
    );
  } catch {
    return false;
  }
}

/** True when any identity of the evidence lies in the reserved synthetic namespace. */
export const hasFixtureIdentity = (ids: readonly string[]): boolean =>
  ids.some((id) => id.startsWith(FIXTURE_NAMESPACE_PREFIX));
