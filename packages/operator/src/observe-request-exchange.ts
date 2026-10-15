import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  CanonicalTimeSchema,
  EntityId,
  canonicalJson,
  fail,
  ok,
  type Result,
} from "@immortalis/contracts";
import { nodeFs, type FsOps } from "@immortalis/engine";

/**
 * The trusted local routing state of a HOST-REQUESTED observation (BLUE v5.2-A1 bounded brief 2026-10-15): which concrete host identity may
 * ASK the operator to consider a look, and the one pending ask.
 *
 * It lives in the owner-only retained-state directory, beside but entirely separate from the referee exchange and from the player-view
 * (read) binding: a different directory, a different format and different secrets, so neither a referee host's secret nor a player-view
 * secret opens anything here, and this secret opens nothing there. The READ credential is never given a request authority, and this
 * REQUEST credential is never given a read authority.
 *
 *   observe-request-<campaign>/config.json    the TRUSTED binding of concrete host identities to the ONE character this operator kept and
 *                                              placed (written by the operator's bind action, never by a host, a player or a model)
 *   observe-request-<campaign>/<host>.secret  the host's shared secret (owner-only), handed to the host's tool server by PATH
 *   observe-request-<campaign>/request.json   the ONE pending ask: non-canonical routing state, not a choice, an intent, an observation
 *                                              or a canonical record of any kind
 *
 * What a matching secret proves is only that the process holding it was started from a configuration this operating-system user wrote for
 * this campaign. It confers NO role and NO permission, and it is NOT authorization to act: it entitles the host to leave a request for the
 * operator to consider. The pending ask carries nothing the host chose: the host supplies no argument, so every field of it is selected and
 * proved by the trusted side.
 */

export const OBSERVE_REQUEST_CONFIG_FORMAT = "immortalis-operator-observe-request-config";
export const OBSERVE_REQUEST_FORMAT = "immortalis-operator-observe-request";
const FORMAT_VERSION = 1;

const HostId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
const SecretText = z.string().regex(/^[0-9a-f]{64}$/);
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const RequestId = z.string().regex(/^[0-9a-f]{32}$/);

/** The most hosts one campaign binding may hold; `ConfigSchema` rejects a larger file, so `bindObserveRequestHost` must never write one. */
const MAX_HOSTS = 8;

const ConfigSchema = z.strictObject({
  format: z.literal(OBSERVE_REQUEST_CONFIG_FORMAT),
  format_version: z.literal(FORMAT_VERSION),
  campaign_id: z.string().min(1),
  operator_uid: z.number().int().nonnegative(),
  hosts: z
    .array(
      z.strictObject({
        host_id: HostId,
        secret_sha256: Digest,
        /** the character the operator kept and placed when the host was bound; every request re-proves it against canon */
        pc_id: EntityId,
      }),
    )
    .max(MAX_HOSTS),
});
export type ObserveRequestConfig = z.infer<typeof ConfigSchema>;

/**
 * The one pending ask. It records WHO asked (the authenticated host identity), FOR WHICH proved character, and AT WHICH canonical basis the
 * trusted side saw when it was made. It states no choice, no confirmation, no verdict, no world fact and no time to advance.
 */
const RequestSchema = z.strictObject({
  format: z.literal(OBSERVE_REQUEST_FORMAT),
  format_version: z.literal(FORMAT_VERSION),
  campaign_id: z.string().min(1),
  operator_uid: z.number().int().nonnegative(),
  request_id: RequestId,
  host_id: HostId,
  pc_id: EntityId,
  basis: CanonicalTimeSchema,
});
export type ObserveRequestRecord = z.infer<typeof RequestSchema>;

export type ObserveRequestExchangeCode =
  | "NOT_CONFIGURED"
  | "CONFIG_INVALID"
  | "HOST_EXISTS"
  | "HOST_UNKNOWN"
  | "REQUEST_INVALID"
  | "IO_FAILED";

export interface ObserveRequestExchangeParams {
  readonly stateDir: string;
  readonly campaignId: string;
  readonly fs?: FsOps;
}

const fsOf = (p: ObserveRequestExchangeParams): FsOps => p.fs ?? nodeFs;

export const observeRequestDir = (p: ObserveRequestExchangeParams): string =>
  join(
    p.stateDir,
    `observe-request-${createHash("sha256").update(p.campaignId, "utf8").digest("hex").slice(0, 32)}`,
  );
const configPath = (p: ObserveRequestExchangeParams) => join(observeRequestDir(p), "config.json");
const requestPath = (p: ObserveRequestExchangeParams) => join(observeRequestDir(p), "request.json");
export const observeRequestSecretPath = (p: ObserveRequestExchangeParams, hostId: string): string =>
  join(observeRequestDir(p), `${hostId}.secret`);

const digestOf = (secret: string): string =>
  createHash("sha256").update(secret, "utf8").digest("hex");

const equalHex = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

export async function readObserveRequestConfig(
  p: ObserveRequestExchangeParams,
  operatorUid: number,
): Promise<Result<ObserveRequestConfig, ObserveRequestExchangeCode>> {
  const fs = fsOf(p);
  let raw: string;
  try {
    if ((await fs.fileSize(configPath(p))) === null)
      return fail("NOT_CONFIGURED", "no observation-request host is bound to this campaign");
    raw = (await fs.readFile(configPath(p))).toString("utf8");
  } catch {
    return fail("IO_FAILED", "the observation-request binding cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("CONFIG_INVALID", "the observation-request binding is not valid");
  }
  const parsed = ConfigSchema.safeParse(json);
  if (
    !parsed.success ||
    parsed.data.campaign_id !== p.campaignId ||
    parsed.data.operator_uid !== operatorUid
  )
    return fail(
      "CONFIG_INVALID",
      "the observation-request binding is not this campaign's or this operator's",
    );
  return ok(parsed.data);
}

/**
 * Binds one concrete host identity to the character `pcId`. The caller (the trusted bind action) has ALREADY proved that character against
 * canon; nothing a player, a model or a host says can reach this. The host's secret is written to an owner-only file whose PATH (never the
 * secret) goes into the host's tool-server configuration.
 */
export async function bindObserveRequestHost(
  p: ObserveRequestExchangeParams & {
    readonly operatorUid: number;
    readonly hostId: string;
    readonly pcId: string;
  },
): Promise<Result<{ secret_file: string }, ObserveRequestExchangeCode>> {
  const fs = fsOf(p);
  if (!HostId.safeParse(p.hostId).success || !EntityId.safeParse(p.pcId).success)
    return fail("CONFIG_INVALID", "the host or character identity is not valid");
  const held = await readObserveRequestConfig(p, p.operatorUid);
  if (!held.ok && held.error.code !== "NOT_CONFIGURED") return held;
  const config: ObserveRequestConfig = held.ok
    ? held.value
    : {
        format: OBSERVE_REQUEST_CONFIG_FORMAT,
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
  const secret = randomBytes(32).toString("hex");
  const next: ObserveRequestConfig = {
    ...config,
    hosts: [...config.hosts, { host_id: p.hostId, secret_sha256: digestOf(secret), pc_id: p.pcId }],
  };
  try {
    await fs.mkdirp(observeRequestDir(p));
    await chmod(observeRequestDir(p), 0o700);
    await fs.createExclusive(observeRequestSecretPath(p, p.hostId), `${secret}\n`);
    await chmod(observeRequestSecretPath(p, p.hostId), 0o600);
    await fs.writeFileDurable(configPath(p), `${JSON.stringify(next, null, 2)}\n`);
    await chmod(configPath(p), 0o600);
  } catch {
    return fail("IO_FAILED", "the observation-request binding could not be written");
  }
  return ok({ secret_file: observeRequestSecretPath(p, p.hostId) });
}

/**
 * Whether `hostId` holds the secret the operator bound to it for this campaign, and the character that binding names. A wrong host, a secret
 * of another host, of another campaign or of the player-view or referee surfaces, an absent or unreadable binding and a binding of another
 * operator are all the same refusal; the comparison is constant-time and runs for an unknown host as well.
 */
export async function authorizeObserveRequestHost(
  p: ObserveRequestExchangeParams,
  operatorUid: number,
  hostId: string,
  secret: string,
): Promise<Result<{ pc_id: string }, ObserveRequestExchangeCode>> {
  const config = await readObserveRequestConfig(p, operatorUid);
  if (!config.ok) return config;
  const entry = config.value.hosts.find((h) => h.host_id === hostId);
  const wellFormed = SecretText.safeParse(secret).success;
  // the digest comparison always runs, against a fixed stand-in when the host or the secret is not valid
  const matches = equalHex(
    digestOf(wellFormed ? secret : ""),
    entry?.secret_sha256 ?? digestOf("-"),
  );
  if (!entry || !wellFormed || !matches)
    return fail("HOST_UNKNOWN", "the observation-request host is not authorized");
  return ok({ pc_id: entry.pc_id });
}

// ---------------------------------------------------------------------------------------------
// the one pending ask
// ---------------------------------------------------------------------------------------------

/** The pending ask, or null when there is none. A file that is not a valid ask of this campaign and operator is `REQUEST_INVALID`. */
export async function readObserveRequest(
  p: ObserveRequestExchangeParams,
  operatorUid: number,
): Promise<Result<ObserveRequestRecord | null, ObserveRequestExchangeCode>> {
  const fs = fsOf(p);
  let raw: string;
  try {
    if ((await fs.fileSize(requestPath(p))) === null) return ok(null);
    raw = (await fs.readFile(requestPath(p))).toString("utf8");
  } catch {
    return fail("IO_FAILED", "the observation request cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("REQUEST_INVALID", "the observation request is not valid");
  }
  const parsed = RequestSchema.safeParse(json);
  if (
    !parsed.success ||
    parsed.data.campaign_id !== p.campaignId ||
    parsed.data.operator_uid !== operatorUid
  )
    return fail("REQUEST_INVALID", "the observation request is not this campaign's or operator's");
  return ok(parsed.data);
}

const sameAsk = (
  a: ObserveRequestRecord,
  b: { readonly pc_id: string; readonly basis: unknown },
): boolean => a.pc_id === b.pc_id && canonicalJson(a.basis) === canonicalJson(b.basis);

/**
 * Leaves the ONE pending ask. Idempotent: an ask already pending for the same character at the same canonical basis is the same ask (whoever
 * left it), and a repeated request does not multiply it. An ask for another basis or character is stale and is replaced; concurrent
 * recorders converge on one file because the create is exclusive. Nothing here touches the campaign package.
 */
export async function recordObserveRequest(
  p: ObserveRequestExchangeParams,
  ask: Omit<ObserveRequestRecord, "request_id" | "format" | "format_version">,
): Promise<Result<{ request_id: string }, ObserveRequestExchangeCode>> {
  const fs = fsOf(p);
  const candidate: ObserveRequestRecord = {
    format: OBSERVE_REQUEST_FORMAT,
    format_version: FORMAT_VERSION,
    ...ask,
    request_id: randomBytes(16).toString("hex"),
  };
  try {
    await fs.mkdirp(observeRequestDir(p));
    await chmod(observeRequestDir(p), 0o700);
    for (let round = 0; round < 4; round++) {
      try {
        await fs.createExclusive(requestPath(p), `${JSON.stringify(candidate, null, 2)}\n`);
        await chmod(requestPath(p), 0o600);
        return ok({ request_id: candidate.request_id });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
      const held = await readObserveRequest(p, ask.operator_uid);
      if (!held.ok) {
        // an unreadable or foreign file is not silently overwritten
        if (held.error.code !== "REQUEST_INVALID") return held;
        return fail("REQUEST_INVALID", "an unrecognised observation request is pending");
      }
      if (held.value !== null) {
        if (sameAsk(held.value, ask)) return ok({ request_id: held.value.request_id });
        // stale: made for another basis or character
        await discardObserveRequest(p, held.value.request_id, ask.operator_uid);
      }
    }
    return fail("IO_FAILED", "the observation request could not be recorded");
  } catch {
    return fail("IO_FAILED", "the observation request could not be recorded");
  }
}

/** Removes the pending ask if, and only if, it is still the one named. */
export async function discardObserveRequest(
  p: ObserveRequestExchangeParams,
  requestId: string,
  operatorUid: number,
): Promise<boolean> {
  try {
    const held = await readObserveRequest(p, operatorUid);
    if (!held.ok || held.value === null || held.value.request_id !== requestId) return false;
    await fsOf(p).remove(requestPath(p));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads a host's secret from its owner-only file; the secret never travels in an argument, an environment variable, a prompt or a log.
 * A symbolic link, another owner's file, a file anyone else can touch or an oversized file is refused.
 */
export function readObserveRequestSecretFile(path: string): string | null {
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
