import { nodeFs, type FsOps } from "@immortalis/engine";

export function observeProtectedFs() {
  const calls: string[] = [];
  let fault: { readonly method: keyof FsOps; readonly code: string } | null = null;
  const fs = Object.fromEntries(
    Object.entries(nodeFs).map(([method, run]) => [
      method,
      (...args: unknown[]) => {
        calls.push(method);
        if (fault?.method === method)
          throw Object.assign(new Error(`private path: ${args[0] as string}`), {
            code: fault.code,
          });
        return (run as (...args: unknown[]) => unknown)(...args);
      },
    ]),
  ) as unknown as FsOps;
  return {
    fs,
    calls,
    fail(method: keyof FsOps, code: string) {
      fault = { method, code };
    },
    restore() {
      fault = null;
    },
  };
}
