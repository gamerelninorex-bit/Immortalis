import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { canonicalJson, fail, ok, type Result } from "@immortalis/contracts";
import { z } from "zod";

const hex = z.string().regex(/^[0-9a-f]{64}$/);
const Intent = z.strictObject({
  format_version: z.literal(1),
  exchange: z.string(),
  campaign_id: z.string(),
  operator_uid: z.number().int(),
  host_id: z.string(),
  pc_id: z.string(),
  seed: hex,
  secret_sha256: hex,
});
const MAX_BINDING_BYTES = 64 * 1024;
const missing = (e: unknown): boolean => (e as NodeJS.ErrnoException).code === "ENOENT";
const digest = (secret: string): string => createHash("sha256").update(secret).digest("hex");
const matches = (left: string, right: string): boolean =>
  timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));

function privateDirectory(path: string, uid: number): number {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const st = fstatSync(fd);
    if (st.uid !== uid || (st.mode & 0o7777) !== 0o700) throw new Error("untrusted directory");
    return fd;
  } catch (e) {
    closeSync(fd);
    throw e;
  }
}

function readPrivate(path: string, uid: number, limit: number): string | null {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.uid !== uid || (st.mode & 0o7777) !== 0o600 || st.size > limit)
      throw new Error("untrusted binding file");
    return readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
}

function present(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (e) {
    if (missing(e)) return false;
    throw e;
  }
}

function publish(path: string, text: string, exclusive: boolean, dirFd: number): void {
  const temp = `${path}.${randomBytes(12).toString("hex")}.tmp`;
  const fd = openSync(temp, "wx", 0o600);
  try {
    try {
      writeFileSync(fd, text);
      fchmodSync(fd, 0o600);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (exclusive) linkSync(temp, path);
    else renameSync(temp, path);
  } finally {
    if (exclusive || present(temp)) unlinkSync(temp);
  }
  fsyncSync(dirFd);
}

interface HostEntry {
  readonly host_id: string;
  readonly pc_id: string;
  readonly secret_sha256: string;
}

/**
 * Only the two trusted bind actions call this, while holding the campaign's writer lock.
 * The owner-only intent commits to the original credential before publishing it. Its seed
 * derives that credential for this exact subject and exchange, and is discarded after commit.
 */
export function bindRequestHost<Config extends { readonly hosts: readonly HostEntry[] }>(p: {
  readonly stateDir: string;
  readonly dir: string;
  readonly campaignId: string;
  readonly operatorUid: number;
  readonly hostId: string;
  readonly pcId: string;
  readonly exchange: string;
  readonly maxHosts: number;
  readonly secretFile: string;
  readonly initialConfig: Config;
  readonly parseConfig: (text: string) => Result<Config, "CONFIG_INVALID">;
  readonly writeError: string;
}): Result<{ secret_file: string }, "CONFIG_INVALID" | "HOST_EXISTS" | "IO_FAILED"> {
  const uid = p.operatorUid;
  const invalid = () => fail("CONFIG_INVALID", "the original binding cannot be verified");
  const duplicate = () =>
    fail("HOST_EXISTS", "this host identity is already bound to this campaign");
  const subject = {
    format_version: 1,
    exchange: p.exchange,
    campaign_id: p.campaignId,
    operator_uid: uid,
    host_id: p.hostId,
    pc_id: p.pcId,
  };
  const derive = (seed: string) =>
    createHmac("sha256", Buffer.from(seed, "hex")).update(canonicalJson(subject)).digest("hex");
  try {
    if (process.getuid?.() !== uid) return invalid();
    const parentFd = privateDirectory(p.stateDir, uid);
    try {
      if (!present(p.dir)) mkdirSync(p.dir, { mode: 0o700 });
      const dirFd = privateDirectory(p.dir, uid);
      try {
        const configPath = join(p.dir, "config.json");
        const configText = readPrivate(configPath, uid, MAX_BINDING_BYTES);
        const held = configText === null ? ok(p.initialConfig) : p.parseConfig(configText);
        if (!held.ok) return held;
        const config = held.value;
        const bound = config.hosts.find((host) => host.host_id === p.hostId);
        const intentPath = join(p.dir, ".binding-intent.json");
        const intentText = readPrivate(intentPath, uid, MAX_BINDING_BYTES);
        if (intentText === null && bound) {
          fsyncSync(dirFd);
          return duplicate();
        }
        if (!bound && config.hosts.length >= p.maxHosts)
          return fail(
            "CONFIG_INVALID",
            "this campaign already has the maximum number of bound hosts",
          );

        // A previous attempt may have created the directory or linked the intent immediately before failing.
        fsyncSync(parentFd);
        let secret: string;
        let hash: string;
        if (intentText === null) {
          // A pre-existing, unbound file without authenticated intent has no recoverable subject.
          if (present(p.secretFile)) return invalid();
          const seed = randomBytes(32).toString("hex");
          secret = derive(seed);
          hash = digest(secret);
          const text = `${JSON.stringify({ ...subject, seed, secret_sha256: hash })}\n`;
          if (Buffer.byteLength(text) > MAX_BINDING_BYTES) return invalid();
          publish(intentPath, text, true, dirFd);
        } else {
          const intent = Intent.safeParse(JSON.parse(intentText));
          if (!intent.success) return invalid();
          const { seed, secret_sha256, ...original } = intent.data;
          if (canonicalJson(original) !== canonicalJson(subject)) {
            if (bound && original.host_id !== p.hostId) return duplicate();
            return invalid();
          }
          secret = derive(seed);
          hash = digest(secret);
          if (!matches(hash, secret_sha256)) return invalid();
        }

        if (bound && (bound.pc_id !== p.pcId || !matches(bound.secret_sha256, hash)))
          return invalid();
        const retained = readPrivate(p.secretFile, uid, 256);
        if (retained === null) {
          if (bound) return invalid();
          if (intentText !== null) fsyncSync(dirFd);
          publish(p.secretFile, `${secret}\n`, true, dirFd);
        } else {
          const text = retained.trim();
          if (!hex.safeParse(text).success || !matches(secret, text)) return invalid();
          // The exact credential and any already published config share this directory barrier.
          fsyncSync(dirFd);
        }
        if (!bound) {
          const next = {
            ...config,
            hosts: [...config.hosts, { host_id: p.hostId, secret_sha256: hash, pc_id: p.pcId }],
          };
          const text = `${JSON.stringify(next, null, 2)}\n`;
          if (Buffer.byteLength(text) > MAX_BINDING_BYTES) return invalid();
          const checked = p.parseConfig(text);
          if (!checked.ok) return checked;
          publish(configPath, text, false, dirFd);
        }
        // Once this final transition is visible, subsequent binds are completed duplicates.
        unlinkSync(intentPath);
        fsyncSync(dirFd);
        return ok({ secret_file: p.secretFile });
      } finally {
        closeSync(dirFd);
      }
    } finally {
      closeSync(parentFd);
    }
  } catch {
    return fail("IO_FAILED", p.writeError);
  }
}
