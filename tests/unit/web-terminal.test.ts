import { expect, it, vi } from "vitest";
import { createWebTerminal } from "../../apps/phone/src/web-terminal.ts";

it("closing after the final output wakes waiting callers without a prompt, new line or timeout", async () => {
  vi.useFakeTimers();
  try {
    const terminal = createWebTerminal();
    terminal.say("the command ended; owner readback is finishing");
    const before = terminal.snapshot(0);
    let woke = false;
    const waiting = terminal.changed(before.seq, 20_000).then(() => {
      woke = true;
    });
    terminal.close();
    await Promise.resolve();
    expect(woke).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(terminal.snapshot(0)).toEqual({ ...before, closed: true });
    await waiting;
  } finally {
    vi.runAllTimers();
    vi.useRealTimers();
  }
});
