import type { FsOps } from "@immortalis/engine";

export class SimulatedCrash extends Error {
  readonly opIndex: number;
  constructor(opIndex: number) {
    super(`simulated crash at mutating op ${opIndex}`);
    this.opIndex = opIndex;
  }
}

const MUTATING = [
  "writeFileDurable",
  "appendDurable",
  "truncate",
  "remove",
  "createExclusive",
  "mkdirp",
] as const;

export interface FaultPlan {
  /** 1-based index of the mutating op to fail; ops are counted across the wrapper's lifetime */
  readonly failAt: number;
  /** "before": the op has no effect; "after": the op takes effect but the caller sees a failure */
  readonly when: "before" | "after";
}

/** Wraps FsOps, counting mutating operations and optionally failing exactly one. */
export function instrumentFs(inner: FsOps, plan?: FaultPlan): { fs: FsOps; count: () => number } {
  let n = 0;
  const wrapped: Record<string, unknown> = { ...inner };
  for (const name of MUTATING) {
    const original = inner[name] as (...args: never[]) => Promise<void>;
    wrapped[name] = async (...args: never[]) => {
      n += 1;
      const mine = n;
      if (plan && mine === plan.failAt && plan.when === "before") throw new SimulatedCrash(mine);
      await original.apply(inner, args);
      if (plan && mine === plan.failAt && plan.when === "after") throw new SimulatedCrash(mine);
    };
  }
  return { fs: wrapped as unknown as FsOps, count: () => n };
}
