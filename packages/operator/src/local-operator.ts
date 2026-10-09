import { mkdirSync, statSync } from "node:fs";
import { userInfo } from "node:os";
import { fail, ok, type Result } from "@immortalis/contracts";

/**
 * The local trust boundary of the operator-facing command-and-reopen mechanism.
 *
 * What is verified, and nothing more: the invoking process runs as an operating-system user (uid) that OWNS the campaign package
 * directory it was asked to operate on, and that directory is not writable by anyone else. That is the same boundary that already
 * protects the package itself: whoever may write the package may forge canon, so the operator who may command it is the user who
 * owns it. It is NOT a login, a credential, a tenant, a remote identity or proof that a human (rather than a script) is typing;
 * no remote authentication provider is implemented or claimed. A deployment that needs more must supply it separately.
 *
 * The retained-intent directory is stricter: owner-only (no group or other access of any kind), because it holds the trusted
 * side's confirmed intents between processes.
 */

export interface LocalOperator {
  readonly kind: "os-user";
  readonly uid: number;
  readonly username: string;
}

export type OperatorRefusalCode =
  | "UNSUPPORTED_PLATFORM"
  | "NOT_A_DIRECTORY"
  | "UNREADABLE"
  | "FOREIGN_OWNER"
  | "WRITABLE_BY_OTHERS"
  | "ACCESSIBLE_BY_OTHERS";

export type DirectoryRole = "campaign" | "operator-state";

/** The pure judgement: the directory belongs to the operator and is closed to everyone else as its role requires. */
export function judgeOperatorDirectory(
  directory: { readonly isDirectory: boolean; readonly uid: number; readonly mode: number },
  operatorUid: number,
  role: DirectoryRole,
): OperatorRefusalCode | null {
  if (!directory.isDirectory) return "NOT_A_DIRECTORY";
  if (directory.uid !== operatorUid) return "FOREIGN_OWNER";
  // group/other WRITE closes the campaign package; any group/other access at all closes the retained-intent directory
  if (role === "campaign" && (directory.mode & 0o022) !== 0) return "WRITABLE_BY_OTHERS";
  if (role === "operator-state" && (directory.mode & 0o077) !== 0) return "ACCESSIBLE_BY_OTHERS";
  return null;
}

/** The invoking operating-system user, or undefined where the platform has no such notion (nothing is then verified). */
function invokingUid(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

export function verifyLocalOperator(
  directory: string,
  role: DirectoryRole,
): Result<LocalOperator, OperatorRefusalCode> {
  const uid = invokingUid();
  if (uid === undefined)
    return fail("UNSUPPORTED_PLATFORM", "no local operating-system user can be verified here");
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(directory);
  } catch {
    return fail("UNREADABLE", "the directory cannot be read");
  }
  const refusal = judgeOperatorDirectory(
    { isDirectory: stat.isDirectory(), uid: stat.uid, mode: stat.mode },
    uid,
    role,
  );
  if (refusal) return fail(refusal, "the local operator is not verified for this directory");
  let username = String(uid);
  try {
    username = userInfo().username;
  } catch {
    // the uid alone identifies the operator; a missing passwd entry is not a refusal
  }
  return ok({ kind: "os-user", uid, username });
}

/** Creates the owner-only retained-intent directory when absent. An existing one is judged, never loosened or tightened here. */
export function ensureOperatorStateDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
}
