import { constants } from "node:fs";
import * as fsp from "node:fs/promises";
import { join } from "node:path";

/**
 * The only filesystem surface the file package uses. Every mutating method is a single durable step,
 * so tests can inject a failure before or after any one of them and observe the on-disk consequence.
 */
export interface FsOps {
  mkdirp(dir: string): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  /** null when the file does not exist */
  fileSize(path: string): Promise<number | null>;
  list(dir: string): Promise<string[]>;
  /** write to a temp name, fsync, rename over `path`, fsync the directory */
  writeFileDurable(path: string, data: string): Promise<void>;
  /** append and fsync */
  appendDurable(path: string, data: string): Promise<void>;
  truncate(path: string, size: number): Promise<void>;
  remove(path: string): Promise<void>;
  /** create only if absent (O_EXCL); fails with code EEXIST otherwise */
  createExclusive(path: string, data: string): Promise<void>;
}

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
    const h = await fsp.open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
    try {
      await h.writeFile(data, "utf8");
      await h.sync();
    } finally {
      await h.close();
    }
  },
};
