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

/** The player lane's single run slot, shared by the phone page and the ordinary-chat adapter: at most one command at a time. */
export interface PlayerRuns {
  readonly current: () => Run | null;
  /** starts one of the closed player commands with options the CLOSED builder validates; refused while another is running */
  readonly launch: (command: string, options: Readonly<Record<string, string>>) => Promise<Launch>;
  /** true while an earlier action's outcome is uncertain and no reconcile has completed since: only a reconcile may be started */
  readonly unresolved: () => boolean;
  /** why the pending operation is still blocked (null when nothing is blocked or no recovery attempt failed yet) */
  readonly blocker: () => string | null;
  /** true when running a reconcile cannot help (the record is unreadable, the operation unsupported or the record unclearable) */
  readonly structural: () => boolean;
  /** ends the pending prompt as a decline and stops the run's replies */
  readonly abort: () => void;
  /** answers the pending confirmation (if any) with a non-confirmation, leaving the run to end by its own account */
  readonly decline: () => void;
}
