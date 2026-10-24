import type { LocalityReadback } from "./locality-evidence.ts";
import type { WebTerminal } from "./web-terminal.ts";

/** One command the player lane is running (or ran last). The sequence numbers of its transcript restart with every run. */
export interface Run {
  readonly id: string;
  readonly label: string;
  readonly terminal: WebTerminal;
  done: boolean;
  /** the command ended in an exception (or reported an unknown outcome): whether it changed anything is NOT established */
  uncertain: boolean;
}

export type Launch =
  | { readonly ok: true; readonly run: Run }
  | { readonly ok: false; readonly status: number; readonly reason: string };

/**
 * What the trusted record and the owners say about the ORIGINAL locality setup, in the allowlisted terms a chat host may relay. `barrier`
 * is what an unresolved setup operation still holds: RECONCILE (the owner-backed reconcile settles it), RESUME (only the same retained
 * document, with a fresh confirmation, can finish it) or ENGINEERING (the operator must inspect it). It carries no path, secret or challenge.
 */
export interface SettingStatus {
  readonly state:
    | "NOT_STARTED"
    | "IN_PROGRESS"
    | "AWAITING_CONFIRMATION"
    | "ESTABLISHED"
    | "NOT_CONFIRMED"
    | "RESUMABLE"
    | "BLOCKED"
    | "UNAVAILABLE";
  readonly barrier: "NONE" | "RECONCILE" | "RESUME" | "ENGINEERING";
  /** the stages already committed under the confirmed identity, in order (RESUMABLE and INCOMPLETE reads) */
  readonly committed?: readonly string[];
  /** the owner-verified read of the established setting (ESTABLISHED only) */
  readonly readback?: LocalityReadback;
  /** the player's own retained proposal, exactly as it was proposed (only while an operation still holds it) */
  readonly proposal?: unknown;
  /** a neutral reason, never a path, secret or the content of a half-formed record */
  readonly detail?: string;
}

/** The player lane's single run slot, shared by the phone page and the ordinary-chat adapter: at most one command at a time. */
export interface PlayerRuns {
  readonly current: () => Run | null;
  /** starts one of the closed player commands with options the CLOSED builder validates; refused while another is running */
  readonly launch: (command: string, options: Readonly<Record<string, string>>) => Promise<Launch>;
  /** true while an earlier action's outcome is uncertain and no reconcile has completed since: only a reconcile may be started */
  readonly unresolved: () => boolean;
  /** why the pending operation is still blocked (null when nothing is blocked or no recovery attempt failed yet) */
  readonly blocker: () => string | null;
  /** true while the unresolved operation is the ORIGINAL locality setup, confirmed and partly committed: only its own resumption finishes it */
  readonly resumable: () => boolean;
  /** true when running a reconcile cannot help (the record is unreadable, the operation unsupported or the record unclearable) */
  readonly structural: () => boolean;
  /** starts the ORIGINAL locality setup for one strictly validated document the caller serialized; the shipped `establish-locality` path and its human confirmation decide everything */
  readonly proposeSetup: (document: string) => Promise<Launch>;
  /** finishes the ONE retained, confirmed, interrupted setup with its own document and a fresh human confirmation (never a replacement) */
  readonly resumeSetup: () => Promise<Launch>;
  /** the owner-backed status of the setting (read-only: it settles nothing and starts nothing) */
  readonly settingStatus: () => Promise<SettingStatus>;
  /** ends the pending prompt as a decline and stops the run's replies */
  readonly abort: () => void;
  /** answers the pending confirmation (if any) with a non-confirmation, leaving the run to end by its own account */
  readonly decline: () => void;
}
