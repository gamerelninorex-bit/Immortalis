import { randomBytes } from "node:crypto";

/**
 * A browser-backed console. It implements the operator's own `OperatorTerminal` seam, so every prompt the operator or referee code
 * issues is shown to the person on the phone and the ONLY thing that can answer it is that person's typed reply. Nothing here answers
 * a prompt, supplies a default, confirms for anyone or edits a reply; a prompt nobody answers expires as a DECLINE (null), which is
 * never a confirmation. A reply is accepted only for the CURRENT prompt's identity, once.
 */
export interface TranscriptLine {
  readonly seq: number;
  readonly kind: "say" | "ask" | "reply" | "system";
  readonly text: string;
}

export interface WebTerminal {
  readonly say: (text: string) => void;
  readonly ask: (prompt: string) => Promise<string | null>;
  readonly close: () => void;
  /** the person's reply to the CURRENT prompt; refused (false) when the identity is not the pending prompt's */
  readonly reply: (promptId: string, text: string) => boolean;
  /** ends the pending prompt as a decline and stops accepting replies (the run is over) */
  readonly abort: () => void;
  readonly snapshot: (after: number) => {
    readonly lines: readonly TranscriptLine[];
    readonly seq: number;
    readonly pending: { readonly id: string; readonly prompt: string } | null;
    readonly closed: boolean;
  };
  /** resolves when anything changes after `after` or after `ms` */
  readonly changed: (after: number, ms: number) => Promise<void>;
}

const MAX_LINES = 2000;
const MAX_LINE = 8192;
const MAX_REPLY = 16384;

export function createWebTerminal(options: { readonly askExpiryMs?: number } = {}): WebTerminal {
  const expiry = options.askExpiryMs ?? 15 * 60_000;
  const lines: TranscriptLine[] = [];
  let seq = 0;
  let closed = false;
  let pending: {
    id: string;
    prompt: string;
    resolve: (v: string | null) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  const waiters = new Set<() => void>();
  const notify = () => {
    for (const w of [...waiters]) w();
  };
  const push = (kind: TranscriptLine["kind"], text: string) => {
    lines.push({
      seq: ++seq,
      kind,
      text: text.length > MAX_LINE ? `${text.slice(0, MAX_LINE)}…` : text,
    });
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    notify();
  };
  const finish = (value: string | null) => {
    if (!pending) return;
    clearTimeout(pending.timer);
    const { resolve } = pending;
    pending = null;
    resolve(value);
    notify();
  };
  return {
    say: (text) => {
      if (!closed) push("say", text);
    },
    ask: (prompt) => {
      if (closed || pending) return Promise.resolve(null);
      push("ask", prompt);
      return new Promise<string | null>((resolve) => {
        const id = randomBytes(12).toString("hex");
        const timer = setTimeout(() => {
          push("system", "No reply was given in time: the prompt was DECLINED, never confirmed.");
          finish(null);
        }, expiry);
        pending = { id, prompt, resolve, timer };
        notify();
      });
    },
    close: () => {
      closed = true;
      finish(null);
    },
    reply: (promptId, text) => {
      if (closed || !pending || pending.id !== promptId || text.length > MAX_REPLY) return false;
      push("reply", text);
      finish(text);
      return true;
    },
    abort: () => {
      closed = true;
      finish(null);
      notify();
    },
    snapshot: (after) => ({
      lines: lines.filter((l) => l.seq > after),
      seq,
      pending: pending ? { id: pending.id, prompt: pending.prompt } : null,
      closed,
    }),
    changed: (after, ms) =>
      new Promise<void>((resolve) => {
        if (seq > after || closed) return resolve();
        const done = () => {
          clearTimeout(timer);
          waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        waiters.add(done);
      }),
  };
}
