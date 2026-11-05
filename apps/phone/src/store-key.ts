import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";

/**
 * The integrity secret of a protected workflow store (pending-action grants, queued setup edits): 32 random bytes created by TRUSTED FIRST
 * STARTUP in the owner-only operator directory, never in a repository, a prompt or a log. It is its own secret - not derived from the lane
 * secrets - so rotating a lane secret (which revokes every token) does not corrupt the stores; a missing, short or unreadable key after the
 * stores exist makes them CORRUPT (fail closed), never silently re-created over existing records.
 */
export function loadOrCreateStoreKey(
  operatorDir: string,
  name: string,
  storeHasRecords: boolean,
): Buffer | null {
  const path = join(operatorDir, name);
  try {
    const hex = readFileSync(path, "utf8").trim();
    return /^[0-9a-f]{64}$/.test(hex) ? Buffer.from(hex, "hex") : null;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT" || storeHasRecords) return null;
  }
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const key = randomBytes(32);
    const fd = openSync(path, "wx", 0o600);
    try {
      writeSync(fd, `${key.toString("hex")}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(path, 0o600);
    return key;
  } catch {
    return null;
  }
}
