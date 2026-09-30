/**
 * Explicit failure classes (Charter principle 20). Domain failures are ordinary control flow and
 * are returned, never thrown. Infrastructure outcomes whose result is not known are `UNKNOWN_OUTCOME`
 * and must be reconciled by identity (RC-16); they are never treated as automatic failure.
 */
export interface Failure<Code extends string = string> {
  readonly code: Code;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type Result<T, Code extends string = string> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: Failure<Code> };

export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

export const fail = <Code extends string>(
  code: Code,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): { ok: false; error: Failure<Code> } => ({
  ok: false,
  error: details === undefined ? { code, message } : { code, message, details },
});
