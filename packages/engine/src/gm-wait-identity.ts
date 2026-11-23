import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------------------------
// F-014B B2 — GM-wait operation identity (BLUE N5 / RED R-7e(3)). It lives in its own module so that the legacy `identity.ts` stays byte-identical to its base.
//
// X is the lowercase hex SHA-256 of a domain-separated, length-delimited encoding of the fixed GM-wait namespace, the verified
// ORIGINAL configured GM session id and the exact `JSON.stringify` text of the original JSON-RPC id. That text is what the trusted
// transport has ALREADY produced (`apps/phone/src/mcp-http.ts` `receiptId = JSON.stringify(id)`, handed on as
// `ToolContext.request.id`): it is hashed AS TEXT and is never serialized a second time, so the numeric id 1 (text `1`) and the
// string id "1" (text `"1"`) are distinct. A body `transaction_id`, a target, a time, a notice id, a later split-RPC id or a renewed
// OAuth grant is not an input. Every other identity of a GM wait is derived from X alone, so a retry reaches the same receipt.
// ---------------------------------------------------------------------------------------------

export const GM_WAIT_X_NAMESPACE = "immortalis/f014b/gm-wait/x/v1";
export const GM_WAIT_REF_NAMESPACE = "immortalis/f014b/gm-wait/ref/v1";

/** 8-byte big-endian length followed by the UTF-8 bytes, per part: unambiguous whatever the parts contain. */
function lengthDelimited(parts: readonly string[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const bytes = Buffer.from(part, "utf8");
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(bytes.length));
    chunks.push(length, bytes);
  }
  return Buffer.concat(chunks);
}

/**
 * A string that survives UTF-8 encoding unchanged. A lone surrogate would be replaced by U+FFFD on encoding, so two different
 * inputs could collide; such an input is refused rather than hashed.
 */
const wellFormed = (s: unknown): s is string =>
  typeof s === "string" && s.length > 0 && isWellFormedText(s);

/** A string that survives UTF-8 encoding unchanged: no lone surrogate. (Written out, not `String.prototype.isWellFormed`, to keep the lib target.) */
export function isWellFormedText(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

export type GmWaitIdentityError = "GM_WAIT_IDENTITY_INVALID";

/** The authenticated operation identity X, or a refusal when an input is not a non-empty well-formed string. */
export function gmWaitX(
  sessionId: unknown,
  rpcIdSerialized: unknown,
):
  | { readonly ok: true; readonly x: string }
  | { readonly ok: false; readonly error: GmWaitIdentityError } {
  if (!wellFormed(sessionId) || !wellFormed(rpcIdSerialized))
    return { ok: false, error: "GM_WAIT_IDENTITY_INVALID" };
  return {
    ok: true,
    x: createHash("sha256")
      .update(lengthDelimited([GM_WAIT_X_NAMESPACE, sessionId, rpcIdSerialized]))
      .digest("hex"),
  };
}

/** A labelled, domain-separated digest of one verified original input (a session, a request id, a host): never a raw credential. */
export const gmWaitRefSha256 = (label: string, value: string): string =>
  createHash("sha256")
    .update(lengthDelimited([GM_WAIT_REF_NAMESPACE, label, value]))
    .digest("hex");

/** The transaction identity of the one Temporal transaction a GM wait opens. A pure function of X, and a valid EntityId. */
export const gmWaitTransactionId = (x: string): string => `gm-wait:${x}`;
export const gmWaitCause = (x: string): string => `gm-wait:${x}`;

export const gmWaitMarkerGroupId = (x: string): string => `gm-wait-marker-group:${x}`;
export const gmWaitMarkerIntentId = (x: string): string => `gm-wait-marker-intent:${x}`;
/** The OPEN group carries the cause every owner stage of the transaction carries (`transaction:<id>`). */
export const gmWaitOpenGroupId = (x: string): string => `gm-wait-open-group:${x}`;
export const gmWaitOpenIntentId = (x: string): string => `gm-wait-open-intent:${x}`;
export const gmWaitNoOpenGroupId = (x: string): string => `gm-wait-no-open-group:${x}`;
export const gmWaitNoOpenIntentId = (x: string): string => `gm-wait-no-open-intent:${x}`;
export const gmWaitReconcileGroupId = (x: string): string => `gm-wait-reconcile-group:${x}`;
export const gmWaitReconcileIntentId = (x: string): string => `gm-wait-reconcile-intent:${x}`;
