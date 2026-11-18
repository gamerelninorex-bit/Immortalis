import * as fs from "node:fs";

export type FileOp =
  | "openSync"
  | "writeFileSync"
  | "writeSync"
  | "chmodSync"
  | "rmSync"
  | "fchmodSync"
  | "fsyncSync"
  | "linkSync"
  | "renameSync"
  | "unlinkSync"
  | "mkdirSync"
  | "readFileSync"
  | "readdirSync"
  | "lstatSync"
  | "fstatSync";
export interface FileCall {
  readonly op: FileOp;
  readonly path: string;
  readonly destination: unknown;
}

interface Faults {
  before?: (call: FileCall) => void;
  after?: (call: FileCall, result: unknown) => void;
}

/** Observe actual filesystem calls on the fixture. Record descriptors so fd-based operations keep their pathname. */
export function observeFileOps(real: typeof fs, faults: Faults): typeof fs {
  const paths = new Map<number, string>();
  const call = (op: FileOp, args: unknown[]): FileCall => ({
    op,
    path: typeof args[0] === "number" ? (paths.get(args[0]) ?? "") : String(args[0]),
    destination: args[1],
  });
  const overrides: Partial<Record<FileOp | "closeSync", unknown>> = {};
  const names: FileOp[] = [
    "openSync",
    "writeFileSync",
    "writeSync",
    "chmodSync",
    "rmSync",
    "fchmodSync",
    "fsyncSync",
    "linkSync",
    "renameSync",
    "unlinkSync",
    "mkdirSync",
    "readFileSync",
    "readdirSync",
    "lstatSync",
    "fstatSync",
  ];
  for (const name of names) {
    overrides[name] = (...args: unknown[]) => {
      const info = call(name, args);
      faults.before?.(info);
      const result: unknown = Reflect.apply(real[name], real, args);
      if (name === "openSync" && typeof result === "number") paths.set(result, info.path);
      try {
        faults.after?.(info, result);
      } catch (e) {
        if (name === "openSync" && typeof result === "number") {
          paths.delete(result);
          real.closeSync(result);
        }
        throw e;
      }
      return result;
    };
  }
  overrides.closeSync = (fd: number) => {
    paths.delete(fd);
    real.closeSync(fd);
  };
  return Object.assign({ ...real }, overrides);
}

export function interrupt(
  faults: Faults,
  when: keyof Faults,
  matches: (call: FileCall) => boolean,
): () => boolean {
  let fired = false;
  faults[when] = (call) => {
    if (!fired && matches(call)) {
      fired = true;
      throw Object.assign(new Error("simulated interrupted filesystem operation"), { code: "EIO" });
    }
  };
  return () => fired;
}
