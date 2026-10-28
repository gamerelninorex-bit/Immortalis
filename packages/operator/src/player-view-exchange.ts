import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { EntityId, canonicalJson, fail, ok, type Result } from "@immortalis/contracts";
import { nodeFs, type FsOps } from "@immortalis/engine";

/**
 * The trusted local binding of a player-view host (BLUE v5.2 bounded brief 2026-10-15, local player-view MCP transport).
 *
 * It lives in the owner-only retained-state directory, beside but entirely separate from the referee exchange: a different directory, a
 * different format and different secrets, so a referee host's secret opens nothing here and the interpreter-only referee surface is never
 * given a player-viewing authority.
 *
 *   player-view-<campaign>/config.json        the TRUSTED binding of concrete host identities to the ONE character this operator kept and
 *                                              placed (written by the operator's bind action, never by a host, a player or a model)
 *   player-view-<campaign>/<host>.secret      the host's shared secret (owner-only), handed to the host's tool server by PATH
 *
 * What a matching secret proves is only that the process holding it was started from a configuration this operating-system user wrote
 * for this campaign. It confers NO role and NO permission: whom the host may look through is decided by the operator's own binding and
 * proved against canon on every read (see `player-view.ts`), never by a credential, a host name or a model name. It is not a login, a
 * tenant or a remote identity; anyone who can read the owner-only directory is the local operator, and no stronger identity is claimed.
 * The configuration keeps only a digest of the secret.
 */

export const PLAYER_VIEW_CONFIG_FORMAT = "immortalis-operator-player-view-config";
const FORMAT_VERSION = 1;

const HostId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
const SecretText = z.string().regex(/^[0-9a-f]{64}$/);
const Digest = z.string().regex(/^[0-9a-f]{64}$/);

/** The most hosts one campaign binding may hold; `ConfigSchema` rejects a larger file, so `bindPlayerViewHost` must never write one. */
const MAX_HOSTS = 8;

const ConfigSchema = z.strictObject({
  format: z.literal(PLAYER_VIEW_CONFIG_FORMAT),
  format_version: z.literal(FORMAT_VERSION),
  campaign_id: z.string().min(1),
  operator_uid: z.number().int().nonnegative(),
  hosts: z
    .array(
      z.strictObject({
        host_id: HostId,
        secret_sha256: Digest,
        /** the character the operator kept and placed when the host was bound; every read re-proves it against canon */
        pc_id: EntityId,
      }),
    )
    .max(MAX_HOSTS),
});
export type PlayerViewConfig = z.infer<typeof ConfigSchema>;

export type PlayerViewExchangeCode =
  | "NOT_CONFIGURED"
  | "CONFIG_INVALID"
  | "HOST_EXISTS"
  | "HOST_UNKNOWN"
  | "SECRET_INVALID"
  | "IO_FAILED";

export interface PlayerViewExchangeParams {
  readonly stateDir: string;
  readonly campaignId: string;
  readonly fs?: FsOps;
}

const fsOf = (p: PlayerViewExchangeParams): FsOps => p.fs ?? nodeFs;

export const playerViewDir = (p: PlayerViewExchangeParams): string =>
  join(
    p.stateDir,
    `player-view-${createHash("sha256").update(p.campaignId, "utf8").digest("hex").slice(0, 32)}`,
  );
const configPath = (p: PlayerViewExchangeParams) => join(playerViewDir(p), "config.json");
export const playerViewSecretPath = (p: PlayerViewExchangeParams, hostId: string): string =>
  join(playerViewDir(p), `${hostId}.secret`);

const digestOf = (secret: string): string =>
  createHash("sha256").update(secret, "utf8").digest("hex");

const equalHex = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

export async function readPlayerViewConfig(
  p: PlayerViewExchangeParams,
  operatorUid: number,
): Promise<Result<PlayerViewConfig, PlayerViewExchangeCode>> {
  const fs = fsOf(p);
  let raw: string;
  try {
    if ((await fs.fileSize(configPath(p))) === null)
      return fail("NOT_CONFIGURED", "no player-view host is bound to this campaign");
    raw = (await fs.readFile(configPath(p))).toString("utf8");
  } catch {
    return fail("IO_FAILED", "the player-view binding cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("CONFIG_INVALID", "the player-view binding is not valid");
  }
  const parsed = ConfigSchema.safeParse(json);
  if (
    !parsed.success ||
    parsed.data.campaign_id !== p.campaignId ||
    parsed.data.operator_uid !== operatorUid
  )
    return fail(
      "CONFIG_INVALID",
      "the player-view binding is not this campaign's or this operator's",
    );
  return ok(parsed.data);
}

const BindingIntentSchema = z.strictObject({
  format: z.literal("immortalis-player-view-binding-intent"),
  campaign_id: z.string().min(1),
  operator_uid: z.number().int().nonnegative(),
  host_id: HostId,
  pc_id: EntityId,
  secret_sha256: Digest.optional(),
});
/** A lost acknowledgement can precede chmod in the existing durable writer. Repair only an owned,
 * non-writable-by-others file inside the sealed private directory, after its original subject/content is proved.
 * The general credential reader remains strict; neither a foreign actor nor an orphan key reaches this path. */
function privateBindingParent(path: string, uid: number): void {
  const st = lstatSync(dirname(path));
  if (!st.isDirectory() || st.uid !== uid || (st.mode & 0o077) !== 0)
    throw new Error("untrusted binding directory");
}
function recoverPrivateMode(path: string, uid: number, matches: (text: string) => boolean): void {
  privateBindingParent(path, uid);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const st = fstatSync(fd);
    if (
      !st.isFile() ||
      st.uid !== uid ||
      (st.mode & 0o133) !== 0 ||
      st.size > 4096 ||
      !matches(readFileSync(fd, "utf8"))
    )
      throw new Error("untrusted binding publication");
    fchmodSync(fd, 0o600);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
/** Interface publication intent, never canon or a permission. It binds recovery of the two private files to this exact original actor. */
function readBindingIntent(path: string, uid: number): z.infer<typeof BindingIntentSchema> | null {
  privateBindingParent(path, uid);
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.uid !== uid || (st.mode & 0o133) !== 0 || st.size > 4096)
      throw new Error("untrusted binding intent");
    return BindingIntentSchema.parse(JSON.parse(readFileSync(fd, "utf8")));
  } finally {
    closeSync(fd);
  }
}

/**
 * Binds one concrete host identity to the character `pcId`. The caller (the trusted bind action) has ALREADY proved that character against
 * canon; nothing a player, a model or a host says can reach this. The host's secret is written to an owner-only file whose PATH (never
 * the secret) goes into the host's tool-server configuration.
 */
export async function bindPlayerViewHost(
  p: PlayerViewExchangeParams & {
    readonly operatorUid: number;
    readonly hostId: string;
    readonly pcId: string;
  },
): Promise<Result<{ secret_file: string }, PlayerViewExchangeCode>> {
  const fs = fsOf(p);
  if (!HostId.safeParse(p.hostId).success || !EntityId.safeParse(p.pcId).success)
    return fail("CONFIG_INVALID", "the host or character identity is not valid");
  const held = await readPlayerViewConfig(p, p.operatorUid);
  if (!held.ok && held.error.code !== "NOT_CONFIGURED") return held;
  const config: PlayerViewConfig = held.ok
    ? held.value
    : {
        format: PLAYER_VIEW_CONFIG_FORMAT,
        format_version: FORMAT_VERSION,
        campaign_id: p.campaignId,
        operator_uid: p.operatorUid,
        hosts: [],
      };
  if (config.hosts.some((h) => h.host_id === p.hostId))
    return fail("HOST_EXISTS", "this host identity is already bound to this campaign");
  // refused before any secret is drawn or anything is written: a ninth host would make the whole binding unreadable
  if (config.hosts.length >= MAX_HOSTS)
    return fail("CONFIG_INVALID", "this campaign already has the maximum number of bound hosts");
  try {
    await fs.mkdirp(playerViewDir(p));
    await chmod(playerViewDir(p), 0o700);
    const path = join(playerViewDir(p), `${p.hostId}.bind-intent.json`);
    const secretFile = playerViewSecretPath(p, p.hostId);
    let intent = readBindingIntent(path, p.operatorUid);
    if (intent === null) {
      // An unbound credential without a prior subject-bound intent has no recoverable actor. Never adopt it.
      if ((await fs.fileSize(secretFile)) !== null)
        return fail(
          "SECRET_INVALID",
          "a credential without its original binding intent cannot be adopted",
        );
      intent = {
        format: "immortalis-player-view-binding-intent",
        campaign_id: p.campaignId,
        operator_uid: p.operatorUid,
        host_id: p.hostId,
        pc_id: p.pcId,
      };
      await fs.createExclusive(path, `${JSON.stringify(intent)}\n`);
      await chmod(path, 0o600);
    }
    if (
      intent.campaign_id !== p.campaignId ||
      intent.operator_uid !== p.operatorUid ||
      intent.host_id !== p.hostId ||
      intent.pc_id !== p.pcId
    )
      return fail("CONFIG_INVALID", "the original binding intent names another host or character");
    recoverPrivateMode(
      path,
      p.operatorUid,
      (text) =>
        canonicalJson(BindingIntentSchema.parse(JSON.parse(text))) === canonicalJson(intent),
    );
    if ((await fs.fileSize(secretFile)) === null) {
      if (intent.secret_sha256) return fail("SECRET_INVALID", "the original credential is missing");
      // Only an unpublished credential may be drawn here. Its sole plaintext home remains the existing secret file.
      await fs.createExclusive(secretFile, `${randomBytes(32).toString("hex")}\n`);
      await chmod(secretFile, 0o600);
    }
    const originalIntent = intent;
    recoverPrivateMode(secretFile, p.operatorUid, (text) => {
      const raw = text.trim();
      return (
        SecretText.safeParse(raw).success &&
        (!originalIntent.secret_sha256 || equalHex(digestOf(raw), originalIntent.secret_sha256))
      );
    });
    const secret = readPlayerViewSecretFile(secretFile);
    if (
      secret === null ||
      (intent.secret_sha256 && !equalHex(digestOf(secret), intent.secret_sha256))
    )
      return fail("SECRET_INVALID", "the credential does not match the original binding intent");
    if (!intent.secret_sha256) {
      intent = { ...intent, secret_sha256: digestOf(secret) };
      await fs.writeFileDurable(path, `${JSON.stringify(intent)}\n`);
      await chmod(path, 0o600);
    }
    const next: PlayerViewConfig = {
      ...config,
      hosts: [
        ...config.hosts,
        { host_id: p.hostId, secret_sha256: digestOf(secret), pc_id: p.pcId },
      ],
    };
    await fs.writeFileDurable(configPath(p), `${JSON.stringify(next, null, 2)}\n`);
    await chmod(configPath(p), 0o600);
  } catch {
    return fail("IO_FAILED", "the player-view binding could not be written");
  }
  return ok({ secret_file: playerViewSecretPath(p, p.hostId) });
}

/**
 * Whether `hostId` holds the secret the operator bound to it for this campaign, and the character that binding names. A wrong host, a
 * secret of another host or of another campaign, an absent or unreadable binding and a binding of another operator are all the same
 * refusal; the comparison is constant-time and runs for an unknown host as well.
 */
export async function authorizePlayerViewHost(
  p: PlayerViewExchangeParams,
  operatorUid: number,
  hostId: string,
  secret: string,
): Promise<Result<{ pc_id: string }, PlayerViewExchangeCode>> {
  const config = await readPlayerViewConfig(p, operatorUid);
  if (!config.ok) return config;
  const entry = config.value.hosts.find((h) => h.host_id === hostId);
  const wellFormed = SecretText.safeParse(secret).success;
  // the digest comparison always runs, against a fixed stand-in when the host or the secret is not valid
  const matches = equalHex(
    digestOf(wellFormed ? secret : ""),
    entry?.secret_sha256 ?? digestOf("-"),
  );
  if (!entry || !wellFormed || !matches)
    return fail("HOST_UNKNOWN", "the player-view host is not authorized");
  return ok({ pc_id: entry.pc_id });
}

/**
 * Reads a host's secret from its owner-only file; the secret never travels in an argument, an environment variable, a prompt or a log.
 * A symbolic link, another owner's file, a file anyone else can touch or an oversized file is refused.
 */
export function readPlayerViewSecretFile(path: string): string | null {
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
