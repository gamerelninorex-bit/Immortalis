import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmdirSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  REFEREE_OP_I002,
  REFEREE_OP_IR,
  REFEREE_OP_OBSERVATION,
  REFEREE_OP_PHYSICAL,
  REFEREE_OP_SCENE,
} from "@immortalis/contracts";
import {
  bindHost,
  COLLECTION_REFEREE_OPERATIONS,
  DELEGATION_REFEREE_OPERATIONS,
  readConfig,
  refereeDir,
  secretPath,
  type ExchangeOperation,
} from "@immortalis/operator";
import type { PhoneConfig } from "./config.ts";

export interface RefereeBinding {
  readonly hostId: string;
  readonly operations: readonly ExchangeOperation[];
}
const DEFAULT_BINDINGS: Readonly<Record<string, readonly ExchangeOperation[]>> = {
  "gm-setup": [REFEREE_OP_I002, REFEREE_OP_IR, REFEREE_OP_PHYSICAL, REFEREE_OP_OBSERVATION],
  "gm-collection": COLLECTION_REFEREE_OPERATIONS,
  // GM-led first play: the Game Master's scene rulings (the current viewing of a look, and the appearance of a credited output). A
  // SEPARATE least-privilege host, so a deployment already registered with gm-setup,gm-collection keeps loading unchanged; a deployment
  // lists it to opt in. Without a host bound to this operation the legacy look is asked unchanged.
  "gm-scene": [REFEREE_OP_SCENE],
  // H1: the delegated selection of the one missing handling duration (I-002 section 9). Another SEPARATE least-privilege host, for the same
  // reason: gm-collection keeps its two operations, so a registered deployment keeps starting; listing gm-delegate opts in.
  "gm-delegate": DELEGATION_REFEREE_OPERATIONS,
};
const OPERATIONS = Object.values(DEFAULT_BINDINGS).flat();

/** Closed technical configuration, not authority inferred from an arbitrary host name. */
export function parseRefereeBindings(
  hostIds: readonly string[],
  input: unknown = DEFAULT_BINDINGS,
): readonly RefereeBinding[] | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const map = input as Record<string, unknown>;
  if (
    input !== DEFAULT_BINDINGS &&
    (Object.keys(map).length !== hostIds.length ||
      Object.keys(map).some((h) => !hostIds.includes(h)))
  )
    return null;
  if (hostIds.length < 1 || hostIds.length > 8 || new Set(hostIds).size !== hostIds.length)
    return null;
  const out: RefereeBinding[] = [];
  for (const hostId of hostIds) {
    const ops = Object.hasOwn(map, hostId) ? map[hostId] : undefined;
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(hostId) ||
      !Array.isArray(ops) ||
      ops.length < 1 ||
      ops.length > 6 ||
      new Set(ops).size !== ops.length ||
      ops.some((op) => !OPERATIONS.includes(op))
    )
      return null;
    out.push({ hostId, operations: ops as ExchangeOperation[] });
  }
  return out;
}

type Failure =
  | "BINDINGS_REQUIRED"
  | "UNSAFE_PATH"
  | "REGISTRATION_BUSY"
  | "CONFIG_INVALID"
  | "BINDING_MISMATCH"
  | "SECRET_INVALID"
  | "ORPHAN_SECRET"
  | "PARTIAL_CONFIG"
  | "IO_FAILED";
export type RefereeStartup =
  | { readonly ok: true; readonly created: number; readonly reused: number }
  | { readonly ok: false; readonly code: Failure };
class Refusal extends Error {
  readonly code: Failure;
  constructor(code: Failure) {
    super(code);
    this.code = code;
  }
}
const refuse = (code: Failure): never => {
  throw new Refusal(code);
};
const absent = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";

/** Walk without following symlinks. Existing permissions are judged, never "repaired" by chmod. */
function directory(path: string, uid: number, create: boolean): void {
  if (!isAbsolute(path) || path !== resolve(path)) refuse("UNSAFE_PATH");
  const parent = dirname(path);
  if (parent !== path) directory(parent, uid, false);
  let st;
  try {
    st = lstatSync(path);
  } catch (e) {
    if (!absent(e) || !create) throw e;
    mkdirSync(path, { mode: 0o700 });
    st = lstatSync(path);
  }
  if (!st.isDirectory() || st.isSymbolicLink()) refuse("UNSAFE_PATH");
  // Shared sticky parents (e.g. /tmp) protect an operator-owned child. Non-sticky writable parents do not.
  if ((st.mode & 0o022) !== 0 && (st.mode & 0o1000) === 0) refuse("UNSAFE_PATH");
}
function privateDirectory(path: string, uid: number): void {
  directory(path, uid, true);
  const st = lstatSync(path);
  if (st.uid !== uid || (st.mode & 0o077) !== 0) refuse("UNSAFE_PATH");
}
/** null is genuinely absent; a dangling link, foreign file, alias or insecure mode is never absence. */
function privateFile(path: string, uid: number, max: number): string | null {
  try {
    if (lstatSync(path).isSymbolicLink()) refuse("UNSAFE_PATH");
  } catch (e) {
    if (absent(e)) return null;
    throw e;
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const st = fstatSync(fd);
    if (
      !st.isFile() ||
      st.nlink !== 1 ||
      st.uid !== uid ||
      (st.mode & 0o077) !== 0 ||
      st.size > max
    )
      refuse("UNSAFE_PATH");
    return readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
}
function mustBeAbsent(path: string, code: Failure): void {
  try {
    lstatSync(path);
  } catch (e) {
    if (absent(e)) return;
    throw e;
  }
  refuse(code);
}
const sameOps = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((op) => b.includes(op));

/**
 * Trusted serving startup ONLY. No campaign is opened and no task/decision/history directory is enumerated.
 * Reuse the existing exchange and its scoped bindHost; never turn HOST_EXISTS (or any other error) into readiness.
 * A private directory lock serializes startup writers. Interrupted locks/orphan secrets require operator inspection;
 * stopping explicitly is safer than guessing which uncommitted credential to adopt, overwrite or delete.
 */
export async function initializeRefereeHosts(config: PhoneConfig): Promise<RefereeStartup> {
  const bindings =
    config.refereeBindings === undefined
      ? parseRefereeBindings(config.refereeHostIds)
      : parseRefereeBindings(
          config.refereeHostIds,
          Object.fromEntries(config.refereeBindings.map((b) => [b.hostId, b.operations])),
        );
  if (!bindings || (config.refereeBindings && bindings.length !== config.refereeBindings.length))
    return { ok: false, code: "BINDINGS_REQUIRED" };
  const uid = process.getuid?.();
  if (uid === undefined) return { ok: false, code: "UNSAFE_PATH" };
  const p = { stateDir: config.operatorDir, campaignId: config.campaignId };
  const dir = refereeDir(p);
  const lock = join(dir, ".startup-lock");
  let locked = false;
  let outcome: RefereeStartup;
  try {
    // A missing leaf operator directory is created privately; parents must already exist and be safe.
    privateDirectory(config.operatorDir, uid);
    privateDirectory(dir, uid);
    try {
      mkdirSync(lock, { mode: 0o700 });
      locked = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") refuse("REGISTRATION_BUSY");
      throw e;
    }
    mustBeAbsent(join(dir, "config.json.tmp"), "PARTIAL_CONFIG");
    const raw = privateFile(join(dir, "config.json"), uid, 64 * 1024);
    const held = await readConfig(p, uid);
    if (!held.ok && (held.error.code !== "NOT_CONFIGURED" || raw !== null))
      refuse("CONFIG_INVALID");
    const hosts = held.ok ? held.value.hosts : [];
    if (
      new Set(hosts.map((h) => h.host_id)).size !== hosts.length ||
      hosts.some((h) => new Set(h.operations).size !== h.operations.length)
    )
      refuse("CONFIG_INVALID");
    if (
      hosts.length + bindings.filter((b) => !hosts.some((h) => h.host_id === b.hostId)).length >
      8
    )
      refuse("CONFIG_INVALID");
    // Validate the entire intended plan before publishing any missing binding.
    for (const b of bindings) {
      const host = hosts.find((h) => h.host_id === b.hostId);
      const secret = privateFile(secretPath(p, b.hostId), uid, 256);
      if (host) {
        if (!sameOps(host.operations, b.operations)) refuse("BINDING_MISMATCH");
        if (secret === null || !/^[0-9a-f]{64}\n?$/.test(secret) || secret.trim() !== host.secret)
          refuse("SECRET_INVALID");
      } else if (secret !== null) refuse("ORPHAN_SECRET");
    }
    let created = 0;
    for (const b of bindings) {
      if (hosts.some((h) => h.host_id === b.hostId)) continue;
      const bound = await bindHost({
        ...p,
        operatorUid: uid,
        hostId: b.hostId,
        operations: b.operations,
      });
      if (!bound.ok) refuse(bound.error.code === "CONFIG_INVALID" ? "CONFIG_INVALID" : "IO_FAILED");
      created++;
    }
    // Verify the published result, including secret files and private modes, before any socket can listen.
    privateFile(join(dir, "config.json"), uid, 64 * 1024);
    const verified = await readConfig(p, uid);
    if (!verified.ok) throw new Refusal("CONFIG_INVALID");
    for (const b of bindings) {
      const h = verified.value.hosts.find((h) => h.host_id === b.hostId);
      if (!h || !sameOps(h.operations, b.operations)) throw new Refusal("BINDING_MISMATCH");
      if (privateFile(secretPath(p, b.hostId), uid, 256)?.trim() !== h.secret)
        refuse("SECRET_INVALID");
    }
    outcome = { ok: true, created, reused: bindings.length - created };
  } catch (e) {
    outcome = { ok: false, code: e instanceof Refusal ? e.code : "IO_FAILED" };
  }
  // Only this process's lock; an interrupted/foreign lock is never removed.
  try {
    if (locked) rmdirSync(lock);
  } catch {
    return { ok: false, code: "IO_FAILED" };
  }
  return outcome;
}
