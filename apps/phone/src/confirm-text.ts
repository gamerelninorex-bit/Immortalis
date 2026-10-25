import type { Run } from "./runs.ts";

/**
 * Helpers for putting the engine's own confirmation text to the HUMAN whole. The text a person is asked to confirm is the engine's own
 * lines since the last reply, in order and untruncated; it is cut into consecutive parts only to fit the channel (a part confirms
 * nothing), and it is refused when this transcript no longer holds it whole.
 */
export const SETUP_PART_CHARS = 12_000;

/** Cuts `body` into consecutive parts of at most `size` characters, at line ends where possible and never inside a surrogate pair; joining them (a newline after each part cut at a line end, nothing after a hard cut) restores `body` exactly. */
export function splitConfirmation(body: string, size = SETUP_PART_CHARS): string[] {
  const parts: string[] = [];
  let rest = body;
  while (rest.length > size) {
    const at = rest.lastIndexOf("\n", size);
    if (at > 0) {
      parts.push(rest.slice(0, at));
      rest = rest.slice(at + 1);
      continue;
    }
    let cut = size;
    const code = rest.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  parts.push(rest);
  return parts;
}

/** The lines of the engine's current confirmation, in order and untruncated; null when this transcript no longer holds them from the start of the run. */
export function wholeConfirmationBody(run: Run): string | null {
  const snap = run.terminal.snapshot(0);
  // the transcript drops its earliest lines beyond its capacity: a confirmation of a run whose line 1 is gone may have lost its beginning
  if (snap.lines.length === 0 || snap.lines[0]!.seq !== 1) return null;
  let from = 0;
  snap.lines.forEach((l, i) => {
    if (l.kind === "reply") from = i + 1;
  });
  let body = "";
  for (const l of snap.lines.slice(from)) {
    if (l.kind === "ask" || l.kind === "reply") continue;
    body += l.more ? l.text : `${l.text}\n`;
  }
  return body.trim();
}

/** finds each needle in order after `from`; the index after the last, or -1 when one is missing */
export function inOrder(whole: string, from: number, needles: readonly string[]): number {
  let at = from;
  for (const n of needles) {
    const found = whole.indexOf(n, at);
    if (found < 0) return -1;
    at = found + n.length;
  }
  return at;
}
