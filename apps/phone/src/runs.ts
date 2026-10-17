import type { WebTerminal } from "./web-terminal.ts";

/** One command the player lane is running (or ran last). The sequence numbers of its transcript restart with every run. */
export interface Run {
  readonly id: string;
  readonly label: string;
  readonly terminal: WebTerminal;
  done: boolean;
}

/** The player lane's single run slot, shared by the phone page and the ordinary-chat adapter: at most one command at a time. */
export interface PlayerRuns {
  readonly current: () => Run | null;
  /** starts one of the closed player commands with options the CLOSED builder validates; refused while another is running */
  readonly launch: (
    command: string,
    options: Readonly<Record<string, string>>,
  ) => { readonly ok: true; readonly run: Run } | { readonly ok: false; readonly reason: string };
  /** ends the pending prompt as a decline and stops the run's replies */
  readonly abort: () => void;
  /** answers the pending confirmation (if any) with a non-confirmation, leaving the run to end by its own account */
  readonly decline: () => void;
}
