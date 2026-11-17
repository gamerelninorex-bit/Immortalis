import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { fail, ok, type Result } from "@immortalis/contracts";
import { nodeFs, type FsOps } from "@immortalis/engine";

/**
 * The trusted local routing state of the GM-NATIVE FIRST-PROFILE FREIGHT BRIDGE (BLUE v6.2 Continuation Preflight): which concrete host
 * identity may call the GM freight tools on this campaign.
 *
 * It lives in the owner-only retained-state directory, beside but entirely separate from the referee exchange, the player-view (read)
 * binding, the observation-request binding and the time-advance-request binding: a different directory, a different format and
 * different secrets, so no other lane's secret opens anything here and this secret opens nothing there. In particular this credential is
 * never a player-view reader, never an observer and never a time-advance request: it is a GM authoring-and-asking credential for ONE
 * NULL-PC original world, and the referee lane's three tools are untouched.
 *
 *   gm-freight-<campaign>/config.json    the TRUSTED binding of concrete host identities (written by the operator's bind action, never by a
 *                                         host, a player or a model)
 *   gm-freight-<campaign>/<host>.secret  the host's shared secret (owner-only), handed to the host's tool server by PATH
 *
 * What a matching secret proves is only that the process holding it was started from a configuration this operating-system user wrote for
 * this campaign. It confers NO role and NO permission (the GM's authorship is stated by the trusted code per operation, never by a secret, a
 * host name or a model), and it is not authorization to decide anything: the owners judge every act.
 */

export const GM_FREIGHT_CONFIG_FORMAT = "immortalis-operator-gm-freight-config";
const FORMAT_VERSION = 1;

const HostId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
const SecretText = z.string().regex(/^[0-9a-f]{64}$/);
const Digest = z.string().regex(/^[0-9a-f]{64}$/);

/** The most hosts one campaign binding may hold; `ConfigSchema` rejects a larger file, so `bindGmFreightHost` must never write one. */
const MAX_HOSTS = 4;

const ConfigSchema = z.strictObject({
  format: z.literal(GM_FREIGHT_CONFIG_FORMAT),
  format_version: z.literal(FORMAT_VERSION),
  campaign_id: z.string().min(1),
  operator_uid: z.number().int().nonnegative(),
  hosts: z.array(z.strictObject({ host_id: HostId, secret_sha256: Digest })).max(MAX_HOSTS),
});
export type GmFreightConfig = z.infer<typeof ConfigSchema>;

export type GmFreightExchangeCode =
  "NOT_CONFIGURED" | "CONFIG_INVALID" | "HOST_EXISTS" | "HOST_UNKNOWN" | "BIND_BUSY" | "IO_FAILED";

export interface GmFreightExchangeParams {
  readonly stateDir: string;
  readonly campaignId: string;
  readonly fs?: FsOps;
}

const fsOf = (p: GmFreightExchangeParams): FsOps => p.fs ?? nodeFs;

export const gmFreightDir = (p: GmFreightExchangeParams): string =>
  join(
    p.stateDir,
    `gm-freight-${createHash("sha256").update(p.campaignId, "utf8").digest("hex").slice(0, 32)}`,
  );
const configPath = (p: GmFreightExchangeParams) => join(gmFreightDir(p), "config.json");
export const gmFreightSecretPath = (p: GmFreightExchangeParams, hostId: string): string =>
  join(gmFreightDir(p), `${hostId}.secret`);

const digestOf = (secret: string): string =>
  createHash("sha256").update(secret, "utf8").digest("hex");

const equalHex = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

export async function readGmFreightConfig(
  p: GmFreightExchangeParams,
  operatorUid: number,
): Promise<Result<GmFreightConfig, GmFreightExchangeCode>> {
  const fs = fsOf(p);
  let raw: string;
  try {
    if ((await fs.fileSize(configPath(p))) === null)
      return fail("NOT_CONFIGURED", "no GM freight host is bound to this campaign");
    raw = (await fs.readFile(configPath(p))).toString("utf8");
  } catch {
    return fail("IO_FAILED", "the GM freight binding cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("CONFIG_INVALID", "the GM freight binding is not valid");
  }
  const parsed = ConfigSchema.safeParse(json);
  if (
    !parsed.success ||
    parsed.data.campaign_id !== p.campaignId ||
    parsed.data.operator_uid !== operatorUid
  )
    return fail(
      "CONFIG_INVALID",
      "the GM freight binding is not this campaign's or this operator's",
    );
  return ok(parsed.data);
}

/*
 * CRASH-SAFE, SERIALIZED ENROLLMENT (BLUE R-3, R-4).
 *
 * A binding is two durable writes (the host's secret file, then the config that names its digest) that must read as one. The order is
 * fixed: SECRET FIRST, CONFIG LAST. The config is therefore the single commit point: a host exists if and only if the config names it.
 *
 *   - a crash after the secret and before the config leaves an ORPHAN secret file (no config entry): it authorizes nothing, and the next
 *     bind of that host replaces it (it is removed, never trusted);
 *   - a crash after the config leaves a COMPLETE binding whose path the caller never received: the next bind of that host recognises
 *     its own earlier work (the secret file's digest equals the configured digest) and returns the SAME path, rotating nothing;
 *   - a failure between the two is rolled back (the secret file is removed) so nothing is left behind by an ordinary I/O error.
 *
 * The compound read-modify-write of the shared config is serialized by an exclusive lock file (`bind.lock`, created with the atomic
 * create-exclusive operation). A lock whose holder process is gone is reclaimed, and so is a lock file that stays empty or unreadable (a
 * holder that died between creating it and writing it). The package keeps no clock and states no time, so nothing here is measured in
 * seconds: waiting and abandonment are counted in polling attempts. Two enrollments of different hosts therefore both survive; a lost
 * update is impossible, whether the callers share a process or not.
 */
const LOCK_WAIT_ATTEMPTS = 1000;
const LOCK_UNREADABLE_ATTEMPTS = 100;
const LOCK_POLL_MS = 15;

const lockPath = (p: GmFreightExchangeParams) => join(gmFreightDir(p), "bind.lock");

const holderAlive = (pid: unknown): boolean => {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

async function acquireBindLock(p: GmFreightExchangeParams): Promise<string | null> {
  const fs = fsOf(p);
  const mine = JSON.stringify({ pid: process.pid, token: randomBytes(8).toString("hex") });
  let unreadable = 0;
  for (let attempt = 0; attempt < LOCK_WAIT_ATTEMPTS; attempt++) {
    try {
      await fs.createExclusive(lockPath(p), `${mine}\n`);
      return mine;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") return null;
    }
    // held: reclaim it only if its holder is gone (or it never became readable); otherwise wait for it
    try {
      const held = JSON.parse((await fs.readFile(lockPath(p))).toString("utf8")) as {
        pid?: unknown;
      };
      unreadable = 0;
      if (!holderAlive(held.pid)) await fs.remove(lockPath(p));
    } catch {
      // unreadable or vanished: abandoned only if it stays so
      if (++unreadable >= LOCK_UNREADABLE_ATTEMPTS)
        await fs.remove(lockPath(p)).catch(() => undefined);
    }
    await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
  }
  return null;
}

async function releaseBindLock(p: GmFreightExchangeParams, mine: string): Promise<void> {
  const fs = fsOf(p);
  try {
    // only the holder removes its own lock: never a successor's
    if ((await fs.readFile(lockPath(p))).toString("utf8").trim() === mine)
      await fs.remove(lockPath(p));
  } catch {
    // already gone
  }
}

/**
 * Binds one concrete host identity to the campaign's GM freight tools and writes that host's owner-only secret file. The caller (the
 * trusted bind action) has ALREADY proved the campaign is the operator's NULL-PC campaign; nothing a player, a model or a host says can
 * reach this. The PATH of the secret file (never the secret) goes into the host's tool-server configuration. Idempotent by identity: a
 * host that is already completely bound gets its own path back and its secret is never rotated.
 */
export async function bindGmFreightHost(
  p: GmFreightExchangeParams & { readonly operatorUid: number; readonly hostId: string },
): Promise<Result<{ secret_file: string }, GmFreightExchangeCode>> {
  const fs = fsOf(p);
  if (!HostId.safeParse(p.hostId).success)
    return fail("CONFIG_INVALID", "the host identity is not valid");
  try {
    await fs.mkdirp(gmFreightDir(p));
    await chmod(gmFreightDir(p), 0o700);
  } catch {
    return fail("IO_FAILED", "the GM freight binding could not be written");
  }
  const lock = await acquireBindLock(p);
  if (lock === null) return fail("BIND_BUSY", "another enrollment holds the binding; try again");
  try {
    const held = await readGmFreightConfig(p, p.operatorUid);
    if (!held.ok && held.error.code !== "NOT_CONFIGURED") return held;
    const config: GmFreightConfig = held.ok
      ? held.value
      : {
          format: GM_FREIGHT_CONFIG_FORMAT,
          format_version: FORMAT_VERSION,
          campaign_id: p.campaignId,
          operator_uid: p.operatorUid,
          hosts: [],
        };
    const secretFile = gmFreightSecretPath(p, p.hostId);
    const entry = config.hosts.find((h) => h.host_id === p.hostId);
    if (entry) {
      // already named by the config (the commit point): complete only if its secret file still holds the configured secret
      const present = readGmFreightSecretFile(secretFile);
      if (present !== null && equalHex(digestOf(present), entry.secret_sha256))
        return ok({ secret_file: secretFile });
      return fail(
        "HOST_EXISTS",
        "this host is bound but its secret file is missing or is not its own; remove the host binding by hand",
      );
    }
    // not named: any secret file at this path is an orphan of an interrupted enrollment and authorizes nothing
    if ((await fs.fileSize(secretFile)) !== null) await fs.remove(secretFile);
    // refused before any secret is drawn or anything is written: a fifth host would make the whole binding unreadable
    if (config.hosts.length >= MAX_HOSTS)
      return fail("CONFIG_INVALID", "this campaign already has the maximum number of bound hosts");
    const secret = randomBytes(32).toString("hex");
    const next: GmFreightConfig = {
      ...config,
      hosts: [...config.hosts, { host_id: p.hostId, secret_sha256: digestOf(secret) }],
    };
    try {
      await fs.createExclusive(secretFile, `${secret}\n`);
      await chmod(secretFile, 0o600);
      await fs.writeFileDurable(configPath(p), `${JSON.stringify(next, null, 2)}\n`);
      await chmod(configPath(p), 0o600);
    } catch {
      // The config is the commit point and a failure can be reported AFTER it took effect (a lost acknowledgement). If the config now names
      // this host with this secret, the enrollment completed: keep the secret file and report success. Only when it provably does not
      // is the secret file this enrollment created rolled back (if even that fails, the orphan is replaced by the next bind of this host).
      const settled = await readGmFreightConfig(p, p.operatorUid);
      const named = settled.ok
        ? settled.value.hosts.find((h) => h.host_id === p.hostId)
        : undefined;
      if (named && equalHex(named.secret_sha256, digestOf(secret)))
        return ok({ secret_file: secretFile });
      await fs.remove(secretFile).catch(() => undefined);
      return fail("IO_FAILED", "the GM freight binding could not be written");
    }
    return ok({ secret_file: secretFile });
  } finally {
    await releaseBindLock(p, lock);
  }
}

/**
 * Whether `hostId` holds the secret the operator bound to it for this campaign. A wrong host, a secret of another host, of another
 * campaign or of any other lane, an absent or unreadable binding and a binding of another operator are all the same refusal; the
 * comparison is constant-time and runs for an unknown host as well.
 */
export async function authorizeGmFreightHost(
  p: GmFreightExchangeParams,
  operatorUid: number,
  hostId: string,
  secret: string,
): Promise<Result<{ host_id: string }, GmFreightExchangeCode>> {
  const config = await readGmFreightConfig(p, operatorUid);
  if (!config.ok) return config;
  const entry = config.value.hosts.find((h) => h.host_id === hostId);
  const wellFormed = SecretText.safeParse(secret).success;
  const matches = equalHex(
    digestOf(wellFormed ? secret : ""),
    entry?.secret_sha256 ?? digestOf("-"),
  );
  if (!entry || !wellFormed || !matches)
    return fail("HOST_UNKNOWN", "the GM freight host is not authorized");
  return ok({ host_id: entry.host_id });
}

/**
 * Reads a host's secret from its owner-only file; the secret never travels in an argument, an environment variable, a prompt or a log.
 * A symbolic link, another owner's file, a file anyone else can touch or an oversized file is refused.
 */
export function readGmFreightSecretFile(path: string): string | null {
  try {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const st = fstatSync(fd);
      const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
      if (
        !st.isFile() ||
        uid === undefined ||
        st.uid !== uid ||
        (st.mode & 0o077) !== 0 ||
        st.size > 256
      )
        return null;
      const text = readFileSync(fd, "utf8").trim();
      return SecretText.safeParse(text).success ? text : null;
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}
