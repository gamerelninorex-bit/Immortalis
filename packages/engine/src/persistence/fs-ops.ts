import { randomBytes } from "node:crypto";
import { constants, openSync, readSync, closeSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { join } from "node:path";

/**
 * The only filesystem surface the file package uses. Every mutating method is a single durable step,
 * so tests can inject a failure before or after any one of them and observe the on-disk consequence.
 */
export interface FsOps {
  mkdirp(dir: string): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  /** Exact bounded reads; synchronous variant preserves the existing synchronous cold-lookup API. */
  readRange(path: string, offset: number, length: number): Promise<Buffer>;
  readRangeSync(path: string, offset: number, length: number): Buffer;
  /** null when the file does not exist */
  fileSize(path: string): Promise<number | null>;
  list(dir: string): Promise<string[]>;
  /** write to a temp name, fsync, rename over `path`, fsync the directory */
  writeFileDurable(path: string, data: string): Promise<void>;
  /** append and fsync */
  appendDurable(path: string, data: string): Promise<void>;
  truncate(path: string, size: number): Promise<void>;
  remove(path: string): Promise<void>;
  /**
   * create only if absent; fails with code EEXIST otherwise. Atomic across processes, and the file is
   * visible only with its complete content (a reader never sees a created-but-empty file).
   */
  createExclusive(path: string, data: string): Promise<void>;
}

const LINK_UNSUPPORTED = new Set(["EPERM", "ENOTSUP", "ENOSYS", "EXDEV", "EMLINK"]);

const isEnoent = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";

async function fsyncDir(dir: string): Promise<void> {
  const h = await fsp.open(dir, "r");
  try {
    await h.sync();
  } finally {
    await h.close();
  }
}

export const nodeFs: FsOps = {
  mkdirp: async (dir) => {
    await fsp.mkdir(dir, { recursive: true });
  },
  readFile: (path) => fsp.readFile(path),
  readRange: async (path, offset, length) => {
    const h = await fsp.open(path, "r");
    try {
      const bytes = Buffer.alloc(length);
      let n = 0;
      while (n < length) {
        const r = await h.read(bytes, n, length - n, offset + n);
        if (r.bytesRead === 0) throw new Error("truncated bounded read");
        n += r.bytesRead;
      }
      return bytes;
    } finally {
      await h.close();
    }
  },
  readRangeSync: (path, offset, length) => {
    const h = openSync(path, "r");
    try {
      const bytes = Buffer.alloc(length);
      let n = 0;
      while (n < length) {
        const count = readSync(h, bytes, n, length - n, offset + n);
        if (count === 0) throw new Error("truncated bounded read");
        n += count;
      }
      return bytes;
    } finally {
      closeSync(h);
    }
  },
  fileSize: async (path) => {
    try {
      return (await fsp.stat(path)).size;
    } catch (e) {
      if (isEnoent(e)) return null;
      throw e;
    }
  },
  list: async (dir) => {
    try {
      return await fsp.readdir(dir);
    } catch (e) {
      if (isEnoent(e)) return [];
      throw e;
    }
  },
  writeFileDurable: async (path, data) => {
    const tmp = `${path}.tmp`;
    const h = await fsp.open(tmp, "w");
    try {
      await h.writeFile(data, "utf8");
      await h.sync();
    } finally {
      await h.close();
    }
    await fsp.rename(tmp, path);
    await fsyncDir(join(path, ".."));
  },
  appendDurable: async (path, data) => {
    const h = await fsp.open(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT);
    try {
      await h.writeFile(data, "utf8");
      await h.sync();
    } finally {
      await h.close();
    }
  },
  truncate: (path, size) => fsp.truncate(path, size),
  remove: async (path) => {
    try {
      await fsp.unlink(path);
    } catch (e) {
      if (!isEnoent(e)) throw e;
    }
  },
  createExclusive: async (path, data) => {
    // Publish through a private temp name and link(2) it into place: link fails with EEXIST when the
    // target exists (atomic exclusion) and exposes the complete content at once. A process killed
    // before the link leaves only an inert `<path>.<pid>.<rand>.tmp`, never a half-written `path`.
    const tmp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    const h = await fsp.open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
    try {
      await h.writeFile(data, "utf8");
      await h.sync();
    } catch (e) {
      await h.close().catch(() => undefined);
      await fsp.unlink(tmp).catch(() => undefined);
      throw e;
    }
    await h.close();
    try {
      await fsp.link(tmp, path);
    } catch (e) {
      await fsp.unlink(tmp).catch(() => undefined);
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== undefined && LINK_UNSUPPORTED.has(code)) {
        // No silent weaker fallback: a direct O_EXCL create could leave an empty or torn body behind
        // a crash, which every later opener would refuse forever. Atomic publication is the contract.
        throw Object.assign(
          new Error(
            `atomic exclusive publication unsupported: link(2) failed with ${code}; this filesystem cannot host a campaign package`,
          ),
          { code: "EATOMIC_PUBLISH_UNSUPPORTED", cause: e },
        );
      }
      throw e;
    }
    await fsp.unlink(tmp).catch(() => undefined);
  },
};
