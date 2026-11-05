import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { canonicalJson, fail, ok, type Result } from "@immortalis/contracts";
import { nodeFs, type FsOps } from "@immortalis/engine";

/**
 * A strict, versioned, atomically durable record store with authenticated integrity — the common substrate of the v0.9 trusted
 * workflow stores (chronology capture, the private runner's outbox, pending-action grants, queued setup edits, the OAuth grant
 * ledger). Each record is one file: `{format, format_version, name, record, mac}` where `mac` = HMAC-SHA256 over the canonical JSON of
 * everything else under a campaign-lane secret supplied by trusted startup (never stored here, never in a repository or a prompt).
 *
 * Writes are durable before they are acknowledged (temp file, fsync, rename, directory fsync — `FsOps.writeFileDurable`, or
 * `createExclusive` for create-once records). A record whose MAC does not verify, whose name differs from its file, or that is not
 * exactly this envelope is CORRUPT and is never repaired, adopted or guessed: the store reports it and the caller fails closed.
 *
 * Loss or corruption of these stores can block workflow authority; it can never invalidate a canonical world-journal load.
 */
export const PROTECTED_STORE_FORMAT_VERSION = 1;

export type ProtectedStoreErrorCode =
  "STORE_UNREADABLE" | "STORE_CORRUPT" | "STORE_EXISTS" | "STORE_WRITE_FAILED";

interface Envelope {
  readonly format: string;
  readonly format_version: number;
  readonly name: string;
  readonly record: unknown;
  readonly mac: string;
}

const fileFor = (name: string): string =>
  `${createHash("sha256").update(name, "utf8").digest("hex").slice(0, 40)}.json`;

export class ProtectedStore {
  readonly #fs: FsOps;
  readonly #dir: string;
  readonly #format: string;
  readonly #key: Buffer;
  #made = false;

  constructor(params: {
    readonly dir: string;
    readonly format: string;
    /** the lane secret: at least 32 bytes, supplied by trusted startup */
    readonly macKey: Buffer;
    readonly fs?: FsOps;
  }) {
    if (params.macKey.length < 32) throw new Error("the store MAC key must be at least 32 bytes");
    this.#fs = params.fs ?? nodeFs;
    this.#dir = params.dir;
    this.#format = params.format;
    this.#key = params.macKey;
  }

  #mac(e: Omit<Envelope, "mac">): string {
    return createHmac("sha256", this.#key).update(canonicalJson(e), "utf8").digest("hex");
  }

  #seal(name: string, record: unknown): string {
    const base = {
      format: this.#format,
      format_version: PROTECTED_STORE_FORMAT_VERSION,
      name,
      record,
    };
    return JSON.stringify({ ...base, mac: this.#mac(base) });
  }

  async #ensureDir(): Promise<void> {
    if (this.#made) return;
    await this.#fs.mkdirp(this.#dir);
    this.#made = true;
  }

  /** Reads and authenticates one record: `null` when absent, an error when unreadable or corrupt (never repaired). */
  async get(name: string): Promise<Result<unknown | null, ProtectedStoreErrorCode>> {
    const path = join(this.#dir, fileFor(name));
    let raw: string;
    try {
      if ((await this.#fs.fileSize(path)) === null) return ok(null);
      raw = (await this.#fs.readFile(path)).toString("utf8");
    } catch {
      return fail("STORE_UNREADABLE", "a protected record cannot be read");
    }
    let env: Envelope;
    try {
      env = JSON.parse(raw) as Envelope;
    } catch {
      return fail("STORE_CORRUPT", "a protected record is not valid JSON");
    }
    if (
      typeof env !== "object" ||
      env === null ||
      env.format !== this.#format ||
      env.format_version !== PROTECTED_STORE_FORMAT_VERSION ||
      env.name !== name ||
      typeof env.mac !== "string"
    )
      return fail("STORE_CORRUPT", "a protected record is not exactly this store's envelope");
    const { mac, ...rest } = env;
    const want = Buffer.from(this.#mac(rest), "hex");
    const have = Buffer.from(mac, "hex");
    if (want.length !== have.length || !timingSafeEqual(want, have))
      return fail("STORE_CORRUPT", "a protected record fails its integrity check");
    return ok(env.record);
  }

  /** Creates a record only if absent (atomic across processes); an existing one is reported, never overwritten. */
  async create(name: string, record: unknown): Promise<Result<void, ProtectedStoreErrorCode>> {
    try {
      await this.#ensureDir();
      await this.#fs.createExclusive(join(this.#dir, fileFor(name)), this.#seal(name, record));
      return ok(undefined);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST")
        return fail("STORE_EXISTS", "the protected record already exists");
      return fail("STORE_WRITE_FAILED", "the protected record could not be written durably");
    }
  }

  /** Replaces a record durably (the caller owns its own revision check under its own lock). */
  async replace(name: string, record: unknown): Promise<Result<void, ProtectedStoreErrorCode>> {
    try {
      await this.#ensureDir();
      await this.#fs.writeFileDurable(join(this.#dir, fileFor(name)), this.#seal(name, record));
      return ok(undefined);
    } catch {
      return fail("STORE_WRITE_FAILED", "the protected record could not be written durably");
    }
  }

  /**
   * Every authenticated record. A single corrupt, foreign or unreadable file makes the whole listing fail CLOSED: it is never
   * skipped, because a skipped record could be a revocation, a reservation or a tombstone.
   */
  async all(): Promise<Result<{ name: string; record: unknown }[], ProtectedStoreErrorCode>> {
    let files: string[];
    try {
      files =
        (await this.#fs.fileSize(this.#dir)) === null && !this.#made
          ? []
          : await this.#fs.list(this.#dir);
    } catch {
      return ok([]);
    }
    const out: { name: string; record: unknown }[] = [];
    for (const f of files.filter((n) => n.endsWith(".json")).sort()) {
      let name: unknown;
      try {
        name = (
          JSON.parse((await this.#fs.readFile(join(this.#dir, f))).toString("utf8")) as Envelope
        ).name;
      } catch {
        return fail("STORE_CORRUPT", "a protected record is not valid JSON");
      }
      if (typeof name !== "string" || fileFor(name) !== f)
        return fail("STORE_CORRUPT", "a protected record is not at the file its name derives");
      const got = await this.get(name);
      if (!got.ok) return got;
      out.push({ name, record: got.value });
    }
    return ok(out);
  }
}
