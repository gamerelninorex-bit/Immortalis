import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  closeSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { canonicalJson } from "@immortalis/contracts";

/**
 * The authoritative, protected OAuth GRANT LEDGER (Initial Locality Bootstrap v0.9 companion, "Revocation"), keyed by the actual
 * client and grant. It is the one place that says whether a grant — the one authorization a human gave on the consent page — is
 * still alive, so that revoking it ends BOTH its access and its refresh tokens, whatever their signatures still say.
 *
 *   - Every OAuth request consults it, not just delayed work: `verifyAccess` and the refresh validation deny unless the grant is
 *     ISSUED here. An unknown / unissued grant denies even when an old stateless token's signature verifies (an upgrade never
 *     silently adopts a prior token), and a REVOKED grant never returns.
 *   - Token issuance durably registers the ISSUED entry BEFORE any token is returned (the authorization-code redemption fails, and
 *     the code stays spent, if the registration cannot be made durable).
 *   - FAIL CLOSED, application-wide: once the ledger has been initialised, a missing, partial, foreign or corrupt ledger makes
 *     every status read UNAVAILABLE, which denies ordinary access and refresh alike. It is never repaired, guessed or bypassed
 *     because a client "was probably valid".
 *   - Lane-secret rotation still revokes every token (the token signing key changes); it does NOT disturb this ledger, whose
 *     integrity key is its own random secret created at trusted first startup (never in a repository, a prompt or a log).
 *   - Revoking a grant writes nothing to the canonical campaign: already admitted canon and an Input sealed under then-valid
 *     authority stand.
 *
 * Records are one file each (`grant-<hash>.json`): `{format, format_version, campaign_id, client, grant, scopes, state, …, mac}`,
 * `mac` = HMAC-SHA256 over the canonical JSON of everything else. An ISSUED record is created exclusively (hard link) and made
 * durable (file fsync, rename/link, directory fsync) before it is acknowledged; a REVOKED record atomically replaces it. All of it is
 * synchronous: the check and the use of a grant never interleave with a revocation inside one process (the authorization boundary).
 */
export const OAUTH_LEDGER_FORMAT = "immortalis-oauth-grant-ledger";
export const OAUTH_LEDGER_RECORD_FORMAT = "immortalis-oauth-grant";
const FORMAT_VERSION = 1;
const MARKER = "ledger.json";
const KEY = "ledger.key";
const RECORD = /^grant-[0-9a-f]{40}\.json$/;

export type GrantStatus = "ISSUED" | "REVOKED" | "UNKNOWN" | "UNAVAILABLE";
export type RevokedBy = "SELF" | "OPERATOR";

export interface GrantEntry {
  readonly client: string;
  readonly grant: string;
  readonly scopes: readonly string[];
  readonly state: "ISSUED" | "REVOKED";
  readonly issued_at_ms: number;
  readonly revoked_at_ms: number | null;
  readonly revoked_by: RevokedBy | null;
  readonly revision: number;
}

export interface OAuthGrantLedger {
  /** the grant's state now; UNAVAILABLE = the ledger is missing, partial or corrupt (deny everything) */
  readonly status: (client: string, grant: string) => GrantStatus;
  /** durably registers an ISSUED grant before any token is returned; idempotent for an ISSUED grant, never resurrects a REVOKED one */
  readonly register: (entry: {
    readonly client: string;
    readonly grant: string;
    readonly scopes: readonly string[];
  }) => "REGISTERED" | "REVOKED" | "UNAVAILABLE";
  /** ends the grant (its access AND refresh tokens); idempotent; an unknown grant has nothing to revoke */
  readonly revoke: (
    client: string,
    grant: string,
    by: RevokedBy,
  ) => "REVOKED" | "UNKNOWN" | "UNAVAILABLE";
  /** every registered grant, or null when the ledger is unavailable */
  readonly list: () => readonly GrantEntry[] | null;
  /** true when the ledger is initialised, intact and usable now */
  readonly usable: () => boolean;
}

const sha = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
const recordFile = (client: string, grant: string): string =>
  `grant-${sha(`${client}\u0000${grant}`).slice(0, 40)}.json`;

function syncDir(dir: string): void {
  const fd = openSync(dir, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** writes a sibling temp file durably and returns its path (the caller renames or links it, then syncs the directory) */
function writeTemp(dir: string, text: string): string {
  const temp = join(dir, `.tmp-${process.pid}-${randomBytes(6).toString("hex")}`);
  const fd = openSync(temp, "wx", 0o600);
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(temp, 0o600);
  return temp;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

export function openOAuthGrantLedger(params: {
  readonly dir: string;
  readonly campaignId: string;
  readonly now: () => number;
}): OAuthGrantLedger {
  const { dir, campaignId, now } = params;

  const macOf = (k: Buffer, body: Record<string, unknown>): string =>
    createHmac("sha256", k).update(canonicalJson(body), "utf8").digest("hex");
  const seal = (k: Buffer, body: Record<string, unknown>): string =>
    `${JSON.stringify({ ...body, mac: macOf(k, body) })}\n`;
  const verify = (k: Buffer, text: string): Record<string, unknown> | null => {
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch {
      return null;
    }
    if (!isRecord(v) || typeof v["mac"] !== "string") return null;
    const { mac, ...body } = v as Record<string, unknown> & { mac: string };
    const want = Buffer.from(macOf(k, body), "hex");
    let have: Buffer;
    try {
      have = Buffer.from(mac, "hex");
    } catch {
      return null;
    }
    return want.length === have.length && timingSafeEqual(want, have) ? body : null;
  };

  const readKey = (): Buffer | null => {
    try {
      const hex = readFileSync(join(dir, KEY), "utf8").trim();
      return /^[0-9a-f]{64}$/.test(hex) ? Buffer.from(hex, "hex") : null;
    } catch {
      return null;
    }
  };

  // -- trusted first startup: create the key and the marker; anything partial is CORRUPT, never completed or adopted --------------
  const initialize = (): void => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      names = [];
    }
    if (names.length === 0) {
      try {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const k = randomBytes(32);
        const keyTemp = writeTemp(dir, `${k.toString("hex")}\n`);
        renameSync(keyTemp, join(dir, KEY));
        const marker = writeTemp(
          dir,
          seal(k, {
            format: OAUTH_LEDGER_FORMAT,
            format_version: FORMAT_VERSION,
            campaign_id: campaignId,
            created_at_ms: now(),
          }),
        );
        renameSync(marker, join(dir, MARKER));
        syncDir(dir);
      } catch {
        // a half-made ledger is left as it is: it reads as corrupt (fail closed) until the operator inspects it
      }
    }
  };
  initialize();

  /**
   * The key and a verified marker, or null (the ledger is missing, partial, foreign or corrupt). The key is read afresh on every
   * check - nothing is cached in memory - so a swapped or removed key or marker is noticed at the very next request, not at restart.
   */
  const intact = (): Buffer | null => {
    const k = readKey();
    if (k === null) return null;
    let text: string;
    try {
      text = readFileSync(join(dir, MARKER), "utf8");
    } catch {
      return null;
    }
    const marker = verify(k, text);
    return marker !== null &&
      marker["format"] === OAUTH_LEDGER_FORMAT &&
      marker["format_version"] === FORMAT_VERSION &&
      marker["campaign_id"] === campaignId
      ? k
      : null;
  };

  type Read =
    | { readonly kind: "NONE" }
    | { readonly kind: "BAD" }
    | { readonly kind: "RECORD"; readonly entry: GrantEntry };
  const parseRecord = (k: Buffer, text: string, client: string, grant: string): Read => {
    const body = verify(k, text);
    if (
      body === null ||
      body["format"] !== OAUTH_LEDGER_RECORD_FORMAT ||
      body["format_version"] !== FORMAT_VERSION ||
      body["campaign_id"] !== campaignId ||
      body["client"] !== client ||
      body["grant"] !== grant ||
      (body["state"] !== "ISSUED" && body["state"] !== "REVOKED") ||
      !Array.isArray(body["scopes"]) ||
      !body["scopes"].every((s) => typeof s === "string") ||
      typeof body["issued_at_ms"] !== "number" ||
      !Number.isSafeInteger(body["revision"] as number)
    )
      return { kind: "BAD" };
    return {
      kind: "RECORD",
      entry: {
        client,
        grant,
        scopes: body["scopes"] as string[],
        state: body["state"],
        issued_at_ms: body["issued_at_ms"],
        revoked_at_ms: typeof body["revoked_at_ms"] === "number" ? body["revoked_at_ms"] : null,
        revoked_by:
          body["revoked_by"] === "SELF" || body["revoked_by"] === "OPERATOR"
            ? body["revoked_by"]
            : null,
        revision: body["revision"] as number,
      },
    };
  };
  const read = (k: Buffer, client: string, grant: string): Read => {
    let text: string;
    try {
      text = readFileSync(join(dir, recordFile(client, grant)), "utf8");
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === "ENOENT" ? { kind: "NONE" } : { kind: "BAD" };
    }
    return parseRecord(k, text, client, grant);
  };
  const body = (e: GrantEntry): Record<string, unknown> => ({
    format: OAUTH_LEDGER_RECORD_FORMAT,
    format_version: FORMAT_VERSION,
    campaign_id: campaignId,
    client: e.client,
    grant: e.grant,
    scopes: [...e.scopes],
    state: e.state,
    issued_at_ms: e.issued_at_ms,
    revoked_at_ms: e.revoked_at_ms,
    revoked_by: e.revoked_by,
    revision: e.revision,
  });

  return {
    usable: () => intact() !== null,
    status: (client, grant) => {
      const k = intact();
      if (k === null) return "UNAVAILABLE";
      const r = read(k, client, grant);
      return r.kind === "NONE" ? "UNKNOWN" : r.kind === "BAD" ? "UNAVAILABLE" : r.entry.state;
    },
    register: ({ client, grant, scopes }) => {
      const k = intact();
      if (k === null) return "UNAVAILABLE";
      const existing = read(k, client, grant);
      if (existing.kind === "BAD") return "UNAVAILABLE";
      if (existing.kind === "RECORD")
        return existing.entry.state === "ISSUED" ? "REGISTERED" : "REVOKED";
      const entry: GrantEntry = {
        client,
        grant,
        scopes: [...scopes],
        state: "ISSUED",
        issued_at_ms: now(),
        revoked_at_ms: null,
        revoked_by: null,
        revision: 1,
      };
      let temp: string | null = null;
      try {
        temp = writeTemp(dir, seal(k, body(entry)));
        try {
          // hard-link create: exactly one registrant wins, in this process or another; the loser re-reads
          linkSync(temp, join(dir, recordFile(client, grant)));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") return "UNAVAILABLE";
          const raced = read(k, client, grant);
          return raced.kind === "RECORD"
            ? raced.entry.state === "ISSUED"
              ? "REGISTERED"
              : "REVOKED"
            : "UNAVAILABLE";
        }
        syncDir(dir);
        return "REGISTERED";
      } catch {
        return "UNAVAILABLE";
      } finally {
        if (temp !== null) {
          try {
            rmSync(temp, { force: true });
          } catch {
            // a stray temp file is inert: only grant-<hash>.json names are records
          }
        }
      }
    },
    revoke: (client, grant, by) => {
      const k = intact();
      if (k === null) return "UNAVAILABLE";
      const existing = read(k, client, grant);
      if (existing.kind === "NONE") return "UNKNOWN";
      if (existing.kind === "BAD") return "UNAVAILABLE";
      if (existing.entry.state === "REVOKED") return "REVOKED";
      const revoked: GrantEntry = {
        ...existing.entry,
        state: "REVOKED",
        revoked_at_ms: now(),
        revoked_by: by,
        revision: existing.entry.revision + 1,
      };
      let temp: string | null = null;
      try {
        temp = writeTemp(dir, seal(k, body(revoked)));
        renameSync(temp, join(dir, recordFile(client, grant)));
        temp = null;
        syncDir(dir);
        return "REVOKED";
      } catch {
        return "UNAVAILABLE";
      } finally {
        if (temp !== null) {
          try {
            rmSync(temp, { force: true });
          } catch {
            // inert
          }
        }
      }
    },
    list: () => {
      const k = intact();
      if (k === null) return null;
      let names: string[];
      try {
        names = readdirSync(dir).filter((n) => RECORD.test(n));
      } catch {
        return null;
      }
      const out: GrantEntry[] = [];
      for (const n of names.sort()) {
        let text: string;
        try {
          text = readFileSync(join(dir, n), "utf8");
        } catch {
          return null;
        }
        // the record names its own client and grant; its file must be the one those derive
        let head: unknown;
        try {
          head = JSON.parse(text);
        } catch {
          return null;
        }
        if (
          !isRecord(head) ||
          typeof head["client"] !== "string" ||
          typeof head["grant"] !== "string"
        )
          return null;
        if (recordFile(head["client"], head["grant"]) !== n) return null;
        const r = parseRecord(k, text, head["client"], head["grant"]);
        if (r.kind !== "RECORD") return null;
        out.push(r.entry);
      }
      return out;
    },
  };
}
