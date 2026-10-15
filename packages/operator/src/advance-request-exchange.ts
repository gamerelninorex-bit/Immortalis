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
 * The trusted local routing state of a HOST-REQUESTED active-PC target-only time advance (BLUE v5.2-A1 bounded brief 2026-10-15, "Host-Requested
 * Active-PC Target-Only OOC Time"): which concrete host identity may ASK the operator to consider an out-of-character time advance, and the
 * one pending ask.
 *
 * It lives in the owner-only retained-state directory, beside but entirely separate from the referee exchange, from the player-view (read)
 * binding and from the host-requested OBSERVATION binding (`observe-request-*`): a different directory, a different format and different
 * secrets, so neither a referee host's secret, a player-view secret nor an observation-request secret opens anything here, and this secret
 * opens nothing there. The READ credential and the OBSERVATION-request credential are never given a time-advance request authority, and this
 * TIME-ADVANCE request credential is never given a read or an observation authority.
 *
 *   advance-request-<campaign>/config.json    the TRUSTED binding of concrete host identities to the ONE character this operator kept and
 *                                              placed (written by the operator's bind action, never by a host, a player or a model)
 *   advance-request-<campaign>/<host>.secret  the host's shared secret (owner-only), handed to the host's tool server by PATH
 *   advance-request-<campaign>/request-<id>.json  a pending ask: non-canonical routing state, not a choice, an intent, a target, a time or a
 *                                              canonical record of any kind. EVERY ask is its own file, named by its own random identity (see
 *                                              "custody" below)
 *
 * What a matching secret proves is only that the process holding it was started from a configuration this operating-system user wrote for
 * this campaign. It confers NO role and NO permission, and it is NOT authorization to act: it entitles the host to leave a request for the
 * operator to consider. The pending ask carries nothing the host chose: the host supplies no argument, so every field of it is selected and
 * proved by the trusted side.
 */

export const ADVANCE_REQUEST_CONFIG_FORMAT = "immortalis-operator-advance-request-config";
export const ADVANCE_REQUEST_FORMAT = "immortalis-operator-advance-request";
const FORMAT_VERSION = 1;

const HostId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
const SecretText = z.string().regex(/^[0-9a-f]{64}$/);
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const RequestId = z.string().regex(/^[0-9a-f]{32}$/);

/** The most hosts one campaign binding may hold; `ConfigSchema` rejects a larger file, so `bindAdvanceRequestHost` must never write one. */
const MAX_HOSTS = 8;

const ConfigSchema = z.strictObject({
  format: z.literal(ADVANCE_REQUEST_CONFIG_FORMAT),
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
export type AdvanceRequestConfig = z.infer<typeof ConfigSchema>;

/**
 * The one pending ask. It records WHO asked (the authenticated host identity), FOR WHICH proved character, and AT WHICH canonical basis the
 * trusted side saw when it was made. It states no choice, no confirmation, no verdict, no world fact and no time to advance.
 */
const RequestSchema = z.strictObject({
  format: z.literal(ADVANCE_REQUEST_FORMAT),
  format_version: z.literal(FORMAT_VERSION),
  campaign_id: z.string().min(1),
  operator_uid: z.number().int().nonnegative(),
  request_id: RequestId,
  host_id: HostId,
  pc_id: EntityId,
  basis: CanonicalTimeSchema,
});
export type AdvanceRequestRecord = z.infer<typeof RequestSchema>;

export type AdvanceRequestExchangeCode =
  | "NOT_CONFIGURED"
  | "CONFIG_INVALID"
  | "HOST_EXISTS"
  | "HOST_UNKNOWN"
  | "REQUEST_INVALID"
  | "IO_FAILED";

export interface AdvanceRequestExchangeParams {
  readonly stateDir: string;
  readonly campaignId: string;
  readonly fs?: FsOps;
}

const fsOf = (p: AdvanceRequestExchangeParams): FsOps => p.fs ?? nodeFs;

export const advanceRequestDir = (p: AdvanceRequestExchangeParams): string =>
  join(
    p.stateDir,
    `advance-request-${createHash("sha256").update(p.campaignId, "utf8").digest("hex").slice(0, 32)}`,
  );
const configPath = (p: AdvanceRequestExchangeParams) => join(advanceRequestDir(p), "config.json");
/** An ask file is named by the ask's own identity. */
const ASK_FILE = /^request-([0-9a-f]{32})\.json$/;
const askPath = (p: AdvanceRequestExchangeParams, requestId: string) =>
  join(advanceRequestDir(p), `request-${requestId}.json`);
export const advanceRequestSecretPath = (p: AdvanceRequestExchangeParams, hostId: string): string =>
  join(advanceRequestDir(p), `${hostId}.secret`);

const digestOf = (secret: string): string =>
  createHash("sha256").update(secret, "utf8").digest("hex");

const equalHex = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

export async function readAdvanceRequestConfig(
  p: AdvanceRequestExchangeParams,
  operatorUid: number,
): Promise<Result<AdvanceRequestConfig, AdvanceRequestExchangeCode>> {
  const fs = fsOf(p);
  let raw: string;
  try {
    if ((await fs.fileSize(configPath(p))) === null)
      return fail("NOT_CONFIGURED", "no time-advance-request host is bound to this campaign");
    raw = (await fs.readFile(configPath(p))).toString("utf8");
  } catch {
    return fail("IO_FAILED", "the time-advance-request binding cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("CONFIG_INVALID", "the time-advance-request binding is not valid");
  }
  const parsed = ConfigSchema.safeParse(json);
  if (
    !parsed.success ||
    parsed.data.campaign_id !== p.campaignId ||
    parsed.data.operator_uid !== operatorUid
  )
    return fail(
      "CONFIG_INVALID",
      "the time-advance-request binding is not this campaign's or this operator's",
    );
  return ok(parsed.data);
}

/**
 * Binds one concrete host identity to the character `pcId`. The caller (the trusted bind action) has ALREADY proved that character against
 * canon; nothing a player, a model or a host says can reach this. The host's secret is written to an owner-only file whose PATH (never the
 * secret) goes into the host's tool-server configuration.
 */
export async function bindAdvanceRequestHost(
  p: AdvanceRequestExchangeParams & {
    readonly operatorUid: number;
    readonly hostId: string;
    readonly pcId: string;
  },
): Promise<Result<{ secret_file: string }, AdvanceRequestExchangeCode>> {
  const fs = fsOf(p);
  if (!HostId.safeParse(p.hostId).success || !EntityId.safeParse(p.pcId).success)
    return fail("CONFIG_INVALID", "the host or character identity is not valid");
  const held = await readAdvanceRequestConfig(p, p.operatorUid);
  if (!held.ok && held.error.code !== "NOT_CONFIGURED") return held;
  const config: AdvanceRequestConfig = held.ok
    ? held.value
    : {
        format: ADVANCE_REQUEST_CONFIG_FORMAT,
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
  const next: AdvanceRequestConfig = {
    ...config,
    hosts: [...config.hosts, { host_id: p.hostId, secret_sha256: digestOf(secret), pc_id: p.pcId }],
  };
  try {
    await fs.mkdirp(advanceRequestDir(p));
    await chmod(advanceRequestDir(p), 0o700);
    await fs.createExclusive(advanceRequestSecretPath(p, p.hostId), `${secret}\n`);
    await chmod(advanceRequestSecretPath(p, p.hostId), 0o600);
    await fs.writeFileDurable(configPath(p), `${JSON.stringify(next, null, 2)}\n`);
    await chmod(configPath(p), 0o600);
  } catch {
    return fail("IO_FAILED", "the time-advance-request binding could not be written");
  }
  return ok({ secret_file: advanceRequestSecretPath(p, p.hostId) });
}

/**
 * Whether `hostId` holds the secret the operator bound to it for this campaign, and the character that binding names. A wrong host, a secret
 * of another host, of another campaign or of the player-view or referee surfaces, an absent or unreadable binding and a binding of another
 * operator are all the same refusal; the comparison is constant-time and runs for an unknown host as well.
 */
export async function authorizeAdvanceRequestHost(
  p: AdvanceRequestExchangeParams,
  operatorUid: number,
  hostId: string,
  secret: string,
): Promise<Result<{ pc_id: string }, AdvanceRequestExchangeCode>> {
  const config = await readAdvanceRequestConfig(p, operatorUid);
  if (!config.ok) return config;
  const entry = config.value.hosts.find((h) => h.host_id === hostId);
  const wellFormed = SecretText.safeParse(secret).success;
  // the digest comparison always runs, against a fixed stand-in when the host or the secret is not valid
  const matches = equalHex(
    digestOf(wellFormed ? secret : ""),
    entry?.secret_sha256 ?? digestOf("-"),
  );
  if (!entry || !wellFormed || !matches)
    return fail("HOST_UNKNOWN", "the time-advance-request host is not authorized");
  return ok({ pc_id: entry.pc_id });
}

// ---------------------------------------------------------------------------------------------
// the one pending ask
// ---------------------------------------------------------------------------------------------

/*
 * CUSTODY OF THE PENDING ASK (BLUE H-1 repair).
 *
 * The retained state offers no atomic "remove this file only if it still holds X" (a read followed by an unlink of a SHARED pathname can
 * delete a newer ask that was installed between the two, and an extra read or an identity token inside the file does not close that window).
 * So custody does not rest on a shared pathname at all: every ask is its own file, `request-<id>.json`, named by that ask's own random 128-bit
 * identity and created exclusively. An unlink of `request-X.json` can therefore remove ask X and nothing else, whatever else is installed, replaced
 * or recreated at any moment and in any process — identity-bound removal is a property of the name, not of a check that precedes it. A newer
 * ask Y lives at `request-Y.json`, which no cleanup of X names. A re-asked ask (the same character and basis asked again after X was settled) is
 * a NEW identity, so a late or duplicate cleanup of the first can never reach the second.
 *
 * "One pending ask" is the invariant of what is SERVED, not of one pathname: asks are compared against the canonical basis (the package's own
 * single-writer lock serializes the recorders, which create and prune while they hold it, so same-basis asks are not multiplied); an ask for a
 * basis that is no longer current is stale, and the operator discards exactly the identities it classified. Should duplicates of one ask ever
 * coexist (a recorder without the lock), the operator serves the lowest identity and settles the others with it, each by its own name.
 * A crash can leave only an inert `.tmp` (never a half-written ask), and a restart finds the asks that were completely created.
 */

export interface AdvanceRequestListing {
  /** the valid asks of this campaign and operator, lowest identity first */
  readonly asks: readonly AdvanceRequestRecord[];
  /** files that look like asks but are not valid asks of this campaign and operator (never served, never overwritten, never removed) */
  readonly invalid: number;
}

/** Every pending ask. A file that vanishes while it is being read was settled by someone else and is simply not there. */
export async function listAdvanceRequests(
  p: AdvanceRequestExchangeParams,
  operatorUid: number,
): Promise<Result<AdvanceRequestListing, AdvanceRequestExchangeCode>> {
  const fs = fsOf(p);
  let names: string[];
  try {
    names = (await fs.list(advanceRequestDir(p))).filter((n) => ASK_FILE.test(n)).sort();
  } catch {
    return fail("IO_FAILED", "the time-advance requests cannot be read");
  }
  const asks: AdvanceRequestRecord[] = [];
  let invalid = 0;
  for (const name of names) {
    const id = ASK_FILE.exec(name)![1]!;
    let raw: string;
    try {
      raw = (await fs.readFile(askPath(p, id))).toString("utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
      return fail("IO_FAILED", "the time-advance requests cannot be read");
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      invalid += 1;
      continue;
    }
    const parsed = RequestSchema.safeParse(json);
    if (
      !parsed.success ||
      parsed.data.campaign_id !== p.campaignId ||
      parsed.data.operator_uid !== operatorUid ||
      parsed.data.request_id !== id
    )
      invalid += 1;
    else asks.push(parsed.data);
  }
  return ok({ asks, invalid });
}

/** The lowest-identity pending ask, or null when there is none; any invalid ask file with no valid ask is `REQUEST_INVALID`. */
export async function readAdvanceRequest(
  p: AdvanceRequestExchangeParams,
  operatorUid: number,
): Promise<Result<AdvanceRequestRecord | null, AdvanceRequestExchangeCode>> {
  const listed = await listAdvanceRequests(p, operatorUid);
  if (!listed.ok) return listed;
  if (listed.value.asks.length > 0) return ok(listed.value.asks[0]!);
  return listed.value.invalid > 0
    ? fail("REQUEST_INVALID", "the time-advance request is not valid")
    : ok(null);
}

const sameAsk = (
  a: AdvanceRequestRecord,
  b: { readonly pc_id: string; readonly basis: unknown },
): boolean => a.pc_id === b.pc_id && canonicalJson(a.basis) === canonicalJson(b.basis);

/**
 * Leaves the pending ask for `ask`. Idempotent: an ask already pending for the same character at the same canonical basis is the same ask
 * (whoever left it) and is returned, not multiplied. Asks for another basis or character are stale and each is removed BY ITS OWN IDENTITY;
 * the new ask is created exclusively under its own identity. The caller holds the campaign's single-writer lock while it calls this, which
 * is what serializes recorders (see the custody note). Nothing here touches the campaign package.
 */
export async function recordAdvanceRequest(
  p: AdvanceRequestExchangeParams,
  ask: Omit<AdvanceRequestRecord, "request_id" | "format" | "format_version">,
): Promise<Result<{ request_id: string }, AdvanceRequestExchangeCode>> {
  const fs = fsOf(p);
  try {
    await fs.mkdirp(advanceRequestDir(p));
    await chmod(advanceRequestDir(p), 0o700);
    const listed = await listAdvanceRequests(p, ask.operator_uid);
    if (!listed.ok) return listed;
    const same = listed.value.asks.find((a) => sameAsk(a, ask));
    for (const stale of listed.value.asks.filter((a) => !sameAsk(a, ask)))
      await discardAdvanceRequest(p, stale.request_id, ask.operator_uid);
    if (same) return ok({ request_id: same.request_id });
    for (let round = 0; round < 3; round++) {
      const candidate: AdvanceRequestRecord = {
        format: ADVANCE_REQUEST_FORMAT,
        format_version: FORMAT_VERSION,
        ...ask,
        request_id: randomBytes(16).toString("hex"),
      };
      try {
        await fs.createExclusive(
          askPath(p, candidate.request_id),
          `${JSON.stringify(candidate, null, 2)}\n`,
        );
        await chmod(askPath(p, candidate.request_id), 0o600);
        return ok({ request_id: candidate.request_id });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
    }
    return fail("IO_FAILED", "the time-advance request could not be recorded");
  } catch {
    return fail("IO_FAILED", "the time-advance request could not be recorded");
  }
}

/**
 * Removes ask `requestId`, and only that ask: the removal names `request-<requestId>.json`, a path no other ask can ever occupy, so it
 * cannot reach a newer ask however it is interleaved with a replacement (see the custody note). The file is first confirmed to be a valid ask
 * of this campaign and operator with that identity, so a foreign file that merely carries the name is left alone. Returns whether this ask
 * was found and removed; an ask already settled by someone else removes nothing and is `false`.
 */
export async function discardAdvanceRequest(
  p: AdvanceRequestExchangeParams,
  requestId: string,
  operatorUid: number,
): Promise<boolean> {
  if (!RequestId.safeParse(requestId).success) return false;
  const fs = fsOf(p);
  try {
    const raw = (await fs.readFile(askPath(p, requestId))).toString("utf8");
    const parsed = RequestSchema.safeParse(JSON.parse(raw));
    if (
      !parsed.success ||
      parsed.data.request_id !== requestId ||
      parsed.data.campaign_id !== p.campaignId ||
      parsed.data.operator_uid !== operatorUid
    )
      return false;
    await fs.remove(askPath(p, requestId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads a host's secret from its owner-only file; the secret never travels in an argument, an environment variable, a prompt or a log.
 * A symbolic link, another owner's file, a file anyone else can touch or an oversized file is refused.
 */
export function readAdvanceRequestSecretFile(path: string): string | null {
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
