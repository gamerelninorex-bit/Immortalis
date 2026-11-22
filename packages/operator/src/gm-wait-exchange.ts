import { createHash, timingSafeEqual } from "node:crypto";
import { chmod } from "node:fs/promises";
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { EntityId, fail, ok, type Result } from "@immortalis/contracts";
import { nodeFs, type FsOps } from "@immortalis/engine";
import { bindRequestHost } from "./request-host-binding.ts";

/**
 * F-014B A1-2a (BLUE v6.2 pinned brief, 22 Nov 2026): the trusted local ENROLLMENT of a configured GM waiting host, and nothing else.
 *
 * It names which concrete host identity the operator has configured as the Game Master's waiting host for ONE campaign and ONE
 * character, and holds that host's owner-only secret. It lives in the owner-only retained-state directory, beside but entirely separate
 * from the referee exchange (which is why an arbitrary referee host or `gm-scene` is never enough), the player-view (read) binding, the
 * observation-request binding and the time-advance-request binding: a different directory, a different format and different secrets, so
 * no other lane's secret opens anything here and this secret opens nothing there.
 *
 *   gm-wait-<campaign>/config.json    the TRUSTED binding of concrete host identities to the ONE character the operator kept and placed
 *                                      (written by the operator's bind action, never by a host, a player or a model)
 *   gm-wait-<campaign>/<host>.secret  the host's shared secret (owner-only), read by the trusted server by PATH, never from a request
 *   gm-wait-<campaign>/clients.json   the operator's AUTHORIZED OAuth CLIENTS per enrolled host (SHA-256 of the client identity, at most four per
 *                                      host; written only by the operator's authorize-client action). A host with no authorized client is
 *                                      unusable: default deny. A grant is never pinned, so a legitimately renewed grant of the same client
 *                                      works, while another client holding the same lane scope can never select this host (BLUE A1R-01).
 *
 * What a matching secret proves is only that the process holding it was started from a configuration this operating-system user wrote for
 * this campaign. It confers NO role and NO permission by itself: the one authority the adapter states for an enrolled host is the EXISTING
 * `role.gm` / `permission.rule.adjudicate` pair, written by the trusted code per call (never read from a secret, a host name, a model or a
 * request), and it authorizes the single operation named in the configuration. No new permission, no canonical write, no time.
 */

export const GM_WAIT_CONFIG_FORMAT = "immortalis-operator-gm-wait-config";
/** The one operation an enrolled host is enrolled FOR. The literal is the B0 trigger kind, source-verbatim: the operator package may not import the unexported B0 module, so this local copy is pinned equal to it by tests/conformance/a1-2a-scope-conformance.test.ts. */
export const GM_WAIT_OPERATION = "GM_INTERPRETED_PC_WAIT" as const;
const FORMAT_VERSION = 1;

const HostId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
const SecretText = z.string().regex(/^[0-9a-f]{64}$/);
const Digest = z.string().regex(/^[0-9a-f]{64}$/);

/** The most hosts one campaign binding may hold; `ConfigSchema` rejects a larger file, so `bindGmWaitHost` must never write one. */
const MAX_HOSTS = 4;

const ConfigSchema = z.strictObject({
  format: z.literal(GM_WAIT_CONFIG_FORMAT),
  format_version: z.literal(FORMAT_VERSION),
  campaign_id: z.string().min(1),
  operator_uid: z.number().int().nonnegative(),
  /** the one operation these hosts are enrolled for: no other operation is ever read from here */
  operation: z.literal(GM_WAIT_OPERATION),
  hosts: z
    .array(
      z.strictObject({
        host_id: HostId,
        secret_sha256: Digest,
        /** the character the operator kept and placed when the host was enrolled; every call re-proves it against canon */
        pc_id: EntityId,
      }),
    )
    .max(MAX_HOSTS),
});
export type GmWaitConfig = z.infer<typeof ConfigSchema>;

export const GM_WAIT_CLIENTS_FORMAT = "immortalis-operator-gm-wait-clients";
/** The most clients one host may authorize; `ClientsSchema` rejects a larger file, so `bindGmWaitClient` must never write one. */
const MAX_CLIENTS_PER_HOST = 4;

const ClientsSchema = z.strictObject({
  format: z.literal(GM_WAIT_CLIENTS_FORMAT),
  format_version: z.literal(FORMAT_VERSION),
  campaign_id: z.string().min(1),
  operator_uid: z.number().int().nonnegative(),
  hosts: z
    .array(
      z.strictObject({
        host_id: HostId,
        client_sha256s: z.array(Digest).min(1).max(MAX_CLIENTS_PER_HOST),
      }),
    )
    .max(MAX_HOSTS),
});
export type GmWaitClients = z.infer<typeof ClientsSchema>;

export type GmWaitExchangeCode =
  "NOT_CONFIGURED" | "CONFIG_INVALID" | "HOST_EXISTS" | "HOST_UNKNOWN" | "IO_FAILED";

export interface GmWaitExchangeParams {
  readonly stateDir: string;
  readonly campaignId: string;
  readonly fs?: FsOps;
}

const fsOf = (p: GmWaitExchangeParams): FsOps => p.fs ?? nodeFs;

export const gmWaitDir = (p: GmWaitExchangeParams): string =>
  join(
    p.stateDir,
    `gm-wait-${createHash("sha256").update(p.campaignId, "utf8").digest("hex").slice(0, 32)}`,
  );
const configPath = (p: GmWaitExchangeParams) => join(gmWaitDir(p), "config.json");
const clientsPath = (p: GmWaitExchangeParams) => join(gmWaitDir(p), "clients.json");
export const gmWaitSecretPath = (p: GmWaitExchangeParams, hostId: string): string =>
  join(gmWaitDir(p), `${hostId}.secret`);

const digestOf = (secret: string): string =>
  createHash("sha256").update(secret, "utf8").digest("hex");

const equalHex = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

function parseConfig(
  p: GmWaitExchangeParams,
  operatorUid: number,
  raw: string,
): Result<GmWaitConfig, "CONFIG_INVALID"> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("CONFIG_INVALID", "the GM waiting binding is not valid");
  }
  const parsed = ConfigSchema.safeParse(json);
  if (
    !parsed.success ||
    parsed.data.campaign_id !== p.campaignId ||
    parsed.data.operator_uid !== operatorUid ||
    new Set(parsed.data.hosts.map((h) => h.host_id)).size !== parsed.data.hosts.length
  )
    return fail(
      "CONFIG_INVALID",
      "the GM waiting binding is not this campaign's or this operator's",
    );
  return ok(parsed.data);
}

export async function readGmWaitConfig(
  p: GmWaitExchangeParams,
  operatorUid: number,
): Promise<Result<GmWaitConfig, GmWaitExchangeCode>> {
  const fs = fsOf(p);
  let raw: string;
  try {
    if ((await fs.fileSize(configPath(p))) === null)
      return fail("NOT_CONFIGURED", "no GM waiting host is enrolled for this campaign");
    raw = (await fs.readFile(configPath(p))).toString("utf8");
  } catch {
    return fail("IO_FAILED", "the GM waiting binding cannot be read");
  }
  return parseConfig(p, operatorUid, raw);
}

/**
 * Enrolls one concrete host identity as the campaign's configured GM waiting host for the character `pcId`. The caller (the trusted bind
 * action) has ALREADY proved that character against canon; nothing a player, a model or a host says can reach this. The host's secret is
 * written to an owner-only file whose PATH (never the secret) goes into the trusted server's configuration. Crash-safe and idempotent by
 * identity through the existing request-host binding (the original credential is committed to an owner-only intent before it is published).
 */
export async function bindGmWaitHost(
  p: GmWaitExchangeParams & {
    readonly operatorUid: number;
    readonly hostId: string;
    readonly pcId: string;
  },
): Promise<Result<{ secret_file: string }, GmWaitExchangeCode>> {
  if (
    p.campaignId.length === 0 ||
    !HostId.safeParse(p.hostId).success ||
    !EntityId.safeParse(p.pcId).success
  )
    return fail("CONFIG_INVALID", "the host or character identity is not valid");
  return bindRequestHost<GmWaitConfig>({
    ...p,
    dir: gmWaitDir(p),
    exchange: GM_WAIT_CONFIG_FORMAT,
    maxHosts: MAX_HOSTS,
    secretFile: gmWaitSecretPath(p, p.hostId),
    initialConfig: {
      format: GM_WAIT_CONFIG_FORMAT,
      format_version: FORMAT_VERSION,
      campaign_id: p.campaignId,
      operator_uid: p.operatorUid,
      operation: GM_WAIT_OPERATION,
      hosts: [],
    },
    parseConfig: (raw) => parseConfig(p, p.operatorUid, raw),
    writeError: "the GM waiting binding could not be written",
  });
}

/**
 * Whether `hostId` holds the secret the operator enrolled for this campaign, and the character that enrollment names. A wrong host, a
 * secret of another host, of another campaign or of any other lane (referee, player-view, observation, time-advance, freight), an absent
 * or unreadable binding and a binding of another operator are all the same refusal; the comparison is constant-time and runs for an
 * unknown host as well.
 */
export async function authorizeGmWaitHost(
  p: GmWaitExchangeParams,
  operatorUid: number,
  hostId: string,
  secret: string,
): Promise<Result<{ pc_id: string; operation: typeof GM_WAIT_OPERATION }, GmWaitExchangeCode>> {
  const config = await readGmWaitConfig(p, operatorUid);
  if (!config.ok) return config;
  const entry = config.value.hosts.find((h) => h.host_id === hostId);
  const wellFormed = SecretText.safeParse(secret).success;
  // the digest comparison always runs, against a fixed stand-in when the host or the secret is not valid
  const matches = equalHex(
    digestOf(wellFormed ? secret : ""),
    entry?.secret_sha256 ?? digestOf("-"),
  );
  if (!entry || !wellFormed || !matches)
    return fail("HOST_UNKNOWN", "the GM waiting host is not authorized");
  return ok({ pc_id: entry.pc_id, operation: config.value.operation });
}

const emptyClients = (p: GmWaitExchangeParams, operatorUid: number): GmWaitClients => ({
  format: GM_WAIT_CLIENTS_FORMAT,
  format_version: FORMAT_VERSION,
  campaign_id: p.campaignId,
  operator_uid: operatorUid,
  hosts: [],
});

async function readClients(
  p: GmWaitExchangeParams,
  operatorUid: number,
): Promise<Result<GmWaitClients | null, GmWaitExchangeCode>> {
  const fs = fsOf(p);
  let raw: string;
  try {
    if ((await fs.fileSize(clientsPath(p))) === null) return ok(null);
    raw = (await fs.readFile(clientsPath(p))).toString("utf8");
  } catch {
    return fail("IO_FAILED", "the GM waiting client binding cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("CONFIG_INVALID", "the GM waiting client binding is not valid");
  }
  const parsed = ClientsSchema.safeParse(json);
  if (
    !parsed.success ||
    parsed.data.campaign_id !== p.campaignId ||
    parsed.data.operator_uid !== operatorUid ||
    new Set(parsed.data.hosts.map((h) => h.host_id)).size !== parsed.data.hosts.length
  )
    return fail(
      "CONFIG_INVALID",
      "the GM waiting client binding is not this campaign's or this operator's",
    );
  return ok(parsed.data);
}

/**
 * Whether the OAuth client `client` (the identity the MCP transport verified from the bearer token, never a tool argument) is one the operator
 * authorized for `hostId`. Default deny: an unreadable, foreign or absent binding, a host with no authorized client and any other client are all
 * `false`. Compares by digest, in constant time over every authorized entry. It names no grant: a renewed grant of the same client passes, a
 * revoked grant fails in the grant ledger, and another client holding the same transport scope never selects this host.
 */
export async function authorizeGmWaitClient(
  p: GmWaitExchangeParams,
  operatorUid: number,
  hostId: string,
  client: string,
): Promise<boolean> {
  const held = await readClients(p, operatorUid);
  if (!held.ok || held.value === null) return false;
  const entry = held.value.hosts.find((h) => h.host_id === hostId);
  const presented = digestOf(client);
  let match = false;
  for (const d of entry?.client_sha256s ?? []) if (equalHex(d, presented)) match = true;
  return entry !== undefined && match;
}

/**
 * The operator's action: authorize (or withdraw) one OAuth client for one ENROLLED host. The host must already be enrolled for this campaign;
 * nothing a client, a model or a host says can reach this. Only the SHA-256 of the client identity is stored.
 */
export async function bindGmWaitClient(
  p: GmWaitExchangeParams & {
    readonly operatorUid: number;
    readonly hostId: string;
    readonly client: string;
    readonly mode: "add" | "remove";
  },
): Promise<Result<{ clients: number }, GmWaitExchangeCode>> {
  if (!HostId.safeParse(p.hostId).success || p.client.length < 1 || p.client.length > 4096)
    return fail("CONFIG_INVALID", "the host or client identity is not valid");
  const fs = fsOf(p);
  const config = await readGmWaitConfig(p, p.operatorUid);
  if (!config.ok) return config;
  if (!config.value.hosts.some((h) => h.host_id === p.hostId))
    return fail("HOST_UNKNOWN", "this host is not enrolled for this campaign");
  const held = await readClients(p, p.operatorUid);
  if (!held.ok) return held;
  const current = held.value ?? emptyClients(p, p.operatorUid);
  const digest = digestOf(p.client);
  const others = current.hosts.filter((h) => h.host_id !== p.hostId);
  const mine = current.hosts.find((h) => h.host_id === p.hostId)?.client_sha256s ?? [];
  const next =
    p.mode === "add" ? [...new Set([...mine, digest])] : mine.filter((d) => !equalHex(d, digest));
  if (next.length > MAX_CLIENTS_PER_HOST)
    return fail("CONFIG_INVALID", "this host already has the maximum number of authorized clients");
  const out: GmWaitClients = {
    ...current,
    hosts: [...others, ...(next.length > 0 ? [{ host_id: p.hostId, client_sha256s: next }] : [])],
  };
  try {
    await fs.mkdirp(gmWaitDir(p));
    await fs.writeFileDurable(clientsPath(p), `${JSON.stringify(out, null, 2)}\n`);
    await chmod(clientsPath(p), 0o600);
  } catch {
    return fail("IO_FAILED", "the GM waiting client binding could not be written");
  }
  return ok({ clients: next.length });
}

/**
 * Reads a host's secret from its owner-only file; the secret never travels in an argument, an environment variable, a prompt or a log.
 * A symbolic link, another owner's file, a file anyone else can touch or an oversized file is refused.
 */
export function readGmWaitSecretFile(path: string): string | null {
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
