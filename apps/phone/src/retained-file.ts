import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { dirname } from "node:path";

const missing = (e: unknown): boolean => (e as NodeJS.ErrnoException).code === "ENOENT";
const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;

function openRetainedDirectory(dir: string): number | null {
  let fd: number;
  try {
    fd = openSync(dir, directoryFlags);
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
  try {
    const stat = fstatSync(fd);
    if (stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0)
      throw new Error("untrusted retained directory");
    return fd;
  } catch (e) {
    closeSync(fd);
    throw e;
  }
}

function verifyFile(stat: Stats): void {
  if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o7777) !== 0o600)
    throw new Error("untrusted retained file");
}

function verifyTargetIfPresent(target: string): void {
  try {
    verifyFile(lstatSync(target));
  } catch (e) {
    if (!missing(e)) throw e;
  }
}

function syncDirectory(dir: string): void {
  const fd = openSync(dir, directoryFlags);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Create one link at a time, syncing its parent before descending. On retry, the
 * last visible link may be from a previous failed barrier. Sync the parent again.
 * Ancestors of the configured directory are part of the trusted local path.
 */
function ensureDirectoryLink(dir: string): void {
  const parent = dirname(dir);
  if (dir === parent) return;
  try {
    if (!lstatSync(dir).isDirectory()) throw new Error("invalid retained path");
  } catch (e) {
    if (!missing(e)) throw e;
    ensureDirectoryLink(parent);
    try {
      mkdirSync(dir, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  syncDirectory(parent);
}

export function readRetainedFile(target: string): string | null {
  const dir = openRetainedDirectory(dirname(target));
  if (dir === null) return null;
  try {
    let fd: number;
    try {
      fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
    try {
      verifyFile(fstatSync(fd));
      return readFileSync(fd, "utf8");
    } finally {
      closeSync(fd);
    }
  } finally {
    closeSync(dir);
  }
}

/** A false result after rename is an unacknowledged publication. Keep the whole new file for readback. */
export function replaceRetainedFile(target: string, value: unknown): boolean {
  const dir = dirname(target);
  try {
    ensureDirectoryLink(dir);
    const dirFd = openRetainedDirectory(dir);
    if (dirFd === null) return false;
    try {
      verifyTargetIfPresent(target);
      const text = `${JSON.stringify(value)}\n`;
      const temp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
      const fd = openSync(temp, "wx", 0o600);
      try {
        try {
          writeFileSync(fd, text, "utf8");
          fchmodSync(fd, 0o600);
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        renameSync(temp, target);
      } catch (e) {
        // An interrupted rename can leave either name. Cleanup only names our temporary file.
        try {
          unlinkSync(temp);
        } catch {
          // An inert sibling can be left behind when cleanup itself fails.
        }
        throw e;
      }
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-sync an existing directory even when the file is already absent: a previous
 * unlink may have succeeded before losing its barrier. A caller that observed
 * absence can request only the barrier so it never removes a newly created file.
 */
export function finishRetainedRemoval(target: string, remove: boolean): boolean {
  try {
    const fd = openRetainedDirectory(dirname(target));
    if (fd === null) return true;
    try {
      if (remove) {
        verifyTargetIfPresent(target);
        try {
          unlinkSync(target);
        } catch (e) {
          if (!missing(e)) throw e;
        }
      }
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return true;
  } catch {
    return false;
  }
}
