import { AsyncLocalStorage } from "node:async_hooks";

// Trusted in-process lifetime only. No tool/CLI flag, serialized field, permission or referee answer.
// One context spans the existing authoring/placement/observation/collection callers of awaitDecision,
// so an HTTP service can stop waiting and let the owning command close its own campaign session.
const lifetime = new AsyncLocalStorage<AbortSignal>();

export function withRefereeCancellation<T>(signal: AbortSignal, run: () => T): T {
  return lifetime.run(signal, run);
}
export const refereeWaitCancelled = (): boolean => lifetime.getStore()?.aborted === true;

export async function pauseRefereeWait(milliseconds: number): Promise<boolean> {
  const signal = lifetime.getStore();
  if (signal?.aborted) return false;
  return new Promise((resolve) => {
    const finish = (continueWaiting: boolean) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      resolve(continueWaiting);
    };
    const cancel = () => finish(false);
    const timer = setTimeout(() => finish(true), milliseconds);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
