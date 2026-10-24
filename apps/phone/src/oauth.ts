import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PhoneConfig } from "./config.ts";

/**
 * A small OAuth 2.1 authorization server for the ordinary-chat adapter (the `/mcp` endpoint), so that a chat host that can only link a
 * server through OAuth (authorization code + PKCE S256, dynamic client registration, bearer tokens) can authenticate to it. It is
 * transport authentication and nothing else: a token says WHICH of the two existing lanes' secrets a human typed on the consent page,
 * as a scope (`player`, `referee`), and the resource server still enforces that scope on every call. No scope is ever granted from a
 * client's request, a registration or a model's wording: each is granted only by the matching lane secret, verified by the same
 * constant-time, rate-limited check the lanes' own sign-in uses. Tokens are stateless (HMAC-signed, audience-bound, expiring); the
 * signing key is derived from both lane secrets, so rotating either secret revokes every token it could have granted.
 */
export const OAUTH_SCOPES = ["player", "referee"] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

const ACCESS_MS = 60 * 60_000;
const REFRESH_MS = 30 * 24 * 3600_000;
const CODE_MS = 5 * 60_000;
const MAX_REDIRECTS = 5;
const MAX_URI = 512;
const MAX_NAME = 80;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const safeEqual = (a: string, b: string) => {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
};

export interface AccessClaims {
  readonly client: string;
  readonly scopes: readonly OAuthScope[];
  /**
   * The identity of the one authorization the human gave on the consent page. It is carried unchanged through every refresh of that
   * grant, and differs between separate grants (even of the same registered client and even for the same scopes): it is what a
   * session and a pending question are bound to, because a public client id is not the authority of a person.
   */
  readonly grant: string;
}

export type SecretCheck = "ok" | "bad" | "locked";

export interface OAuthServer {
  readonly resource: string;
  readonly issuer: string;
  readonly protectedResourceMetadata: () => Record<string, unknown>;
  readonly authorizationServerMetadata: () => Record<string, unknown>;
  readonly register: (body: Record<string, unknown>) => {
    status: number;
    body: Record<string, unknown>;
  };
  /** the consent page's parameters, validated; the page shows exactly what is being asked */
  readonly describeRequest: (query: URLSearchParams) =>
    | {
        readonly ok: true;
        readonly clientName: string;
        readonly redirectHost: string;
        readonly scopes: readonly OAuthScope[];
      }
    | { readonly ok: false; readonly reason: string };
  /** the human's decision: the lane secrets they typed decide which of the requested scopes are granted */
  readonly decide: (
    body: Record<string, unknown>,
    who: string,
  ) => { status: number; body: Record<string, unknown> };
  readonly token: (form: Record<string, unknown>) => {
    status: number;
    body: Record<string, unknown>;
  };
  readonly verifyAccess: (bearer: string) => AccessClaims | null;
}

export function createOAuth(
  config: PhoneConfig,
  now: () => number,
  checkSecret: (who: string, role: "player" | "referee", token: string) => SecretCheck,
): OAuthServer {
  if (config.publicUrl === null) throw new Error("the public origin is not configured");
  const issuer = config.publicUrl;
  const resource = `${issuer}/mcp`;
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      createHash("sha256").update(`${config.playerToken}\n${config.refereeToken}`, "utf8").digest(),
      Buffer.from("immortalis-oauth-v1"),
      Buffer.from("signing-key"),
      32,
    ),
  );
  const sign = (payload: Record<string, unknown>): string => {
    const body = b64(JSON.stringify(payload));
    return `${body}.${b64(createHmac("sha256", key).update(body).digest())}`;
  };
  const open = (token: unknown, type: string): Record<string, unknown> | null => {
    if (typeof token !== "string" || token.length > 4096) return null;
    const [body, mac, extra] = token.split(".");
    if (!body || !mac || extra !== undefined) return null;
    const want = createHmac("sha256", key).update(body).digest();
    let got: Buffer;
    try {
      got = Buffer.from(mac, "base64url");
    } catch {
      return null;
    }
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    try {
      const v: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
      const r = v as Record<string, unknown>;
      if (r["t"] !== type || typeof r["exp"] !== "number" || r["exp"] <= now()) return null;
      return r;
    } catch {
      return null;
    }
  };
  /**
   * Single redemption that survives a restart. A spent code or refresh token leaves one marker file (named by its random id) created
   * with exclusive-create semantics, so the first redemption wins atomically — in this process, across concurrent requests, and after a
   * restart — and every later one fails. Any failure to record the redemption refuses it (fail closed); a redemption lost to a crash
   * between recording and answering simply needs a new authorization, which is the honest reconnect. Markers are removed once the
   * grant they spent could no longer be redeemed anyway (it has expired).
   */
  const spentDir = join(config.operatorDir, "oauth-spent");
  let swept = 0;
  const sweepSpent = () => {
    const t = now();
    if (t - swept < 10 * 60_000) return;
    swept = t;
    try {
      for (const f of readdirSync(spentDir)) {
        if (!/^[0-9a-f]{32}$/.test(f)) continue;
        const exp = Number(readFileSync(join(spentDir, f), "utf8"));
        if (Number.isFinite(exp) && exp < t - 60_000) unlinkSync(join(spentDir, f));
      }
    } catch {
      // nothing to sweep, or a marker raced away: a marker that stays is only ever extra safety
    }
  };
  const consume = (jti: unknown, exp: unknown): boolean => {
    if (typeof jti !== "string" || !/^[0-9a-f]{32}$/.test(jti) || typeof exp !== "number")
      return false;
    try {
      mkdirSync(spentDir, { recursive: true, mode: 0o700 });
      writeFileSync(join(spentDir, jti), String(exp), { flag: "wx", mode: 0o600 });
    } catch {
      return false;
    }
    sweepSpent();
    return true;
  };

  const loopback = (u: URL) => u.hostname === "127.0.0.1" || u.hostname === "localhost";
  const redirectOk = (raw: unknown): URL | null => {
    if (typeof raw !== "string" || raw.length > MAX_URI) return null;
    try {
      const u = new URL(raw);
      const insecureOk = config.transport === "insecure-loopback" && loopback(u);
      if (u.protocol !== "https:" && !(u.protocol === "http:" && insecureOk)) return null;
      if (u.hash !== "" || u.username !== "" || u.password !== "") return null;
      return u;
    } catch {
      return null;
    }
  };
  const scopesOf = (raw: unknown): OAuthScope[] | null => {
    const parts =
      typeof raw === "string" && raw.trim() !== "" ? raw.trim().split(/\s+/) : ["player"];
    const out: OAuthScope[] = [];
    for (const p of parts) {
      if (!OAUTH_SCOPES.some((s) => s === p)) return null;
      if (!out.includes(p as OAuthScope)) out.push(p as OAuthScope);
    }
    return out;
  };
  const clientOf = (id: unknown): { name: string; redirects: string[] } | null => {
    const c = open(id, "client");
    if (!c || !Array.isArray(c["ru"]) || typeof c["nm"] !== "string") return null;
    return {
      name: c["nm"],
      redirects: (c["ru"] as unknown[]).filter((x): x is string => typeof x === "string"),
    };
  };
  // a registration never expires by itself: the secret check at consent is what grants anything
  const FAR = 10 * 365 * 24 * 3600_000;

  const err = (status: number, error: string, description: string) => ({
    status,
    body: { error, error_description: description },
  });

  return {
    resource,
    issuer,
    protectedResourceMetadata: () => ({
      resource,
      authorization_servers: [issuer],
      scopes_supported: [...OAUTH_SCOPES],
      bearer_methods_supported: ["header"],
      resource_name: "IMMORTALIS campaign",
    }),
    authorizationServerMetadata: () => ({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      scopes_supported: [...OAUTH_SCOPES],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      authorization_response_iss_parameter_supported: true,
    }),
    register: (body) => {
      const uris = body["redirect_uris"];
      if (!Array.isArray(uris) || uris.length < 1 || uris.length > MAX_REDIRECTS)
        return err(400, "invalid_redirect_uri", "one to five redirect URIs are required");
      const accepted: string[] = [];
      for (const raw of uris) {
        const u = redirectOk(raw);
        if (!u) return err(400, "invalid_redirect_uri", "a redirect URI must be https");
        accepted.push(u.href);
      }
      const method = body["token_endpoint_auth_method"];
      if (method !== undefined && method !== "none")
        return err(
          400,
          "invalid_client_metadata",
          "only public clients (no client secret) are supported",
        );
      const rawName = body["client_name"];
      const name =
        typeof rawName === "string"
          ? [...rawName]
              .filter((c) => c.codePointAt(0)! >= 0x20 && c.codePointAt(0)! !== 0x7f)
              .join("")
              .slice(0, MAX_NAME)
          : "an application";
      const client_id = sign({
        t: "client",
        ru: accepted,
        nm: name || "an application",
        exp: now() + FAR,
      });
      return {
        status: 201,
        body: {
          client_id,
          client_name: name || "an application",
          redirect_uris: accepted,
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        },
      };
    },
    describeRequest: (q) => {
      const client = clientOf(q.get("client_id"));
      const redirect = redirectOk(q.get("redirect_uri"));
      if (!client || !redirect || !client.redirects.includes(redirect.href))
        return {
          ok: false,
          reason: "this request names a client or redirect that was not registered",
        };
      if (q.get("response_type") !== "code" || q.get("code_challenge_method") !== "S256")
        return {
          ok: false,
          reason: "this request is not an authorization-code request with PKCE S256",
        };
      const challenge = q.get("code_challenge");
      if (challenge === null || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge))
        return { ok: false, reason: "this request carries no valid PKCE challenge" };
      const resourceParam = q.get("resource");
      if (resourceParam !== null && resourceParam !== resource)
        return { ok: false, reason: "this request names another resource" };
      const scopes = scopesOf(q.get("scope"));
      if (!scopes) return { ok: false, reason: "this request names a scope that does not exist" };
      return { ok: true, clientName: client.name, redirectHost: redirect.host, scopes };
    },
    decide: (body, who) => {
      const q = new URLSearchParams();
      for (const k of [
        "client_id",
        "redirect_uri",
        "response_type",
        "code_challenge",
        "code_challenge_method",
        "scope",
        "resource",
        "state",
      ]) {
        const v = body[k];
        if (typeof v === "string") q.set(k, v);
      }
      const described = (() => {
        const client = clientOf(q.get("client_id"));
        const redirect = redirectOk(q.get("redirect_uri"));
        if (!client || !redirect || !client.redirects.includes(redirect.href)) return null;
        if (q.get("response_type") !== "code" || q.get("code_challenge_method") !== "S256")
          return null;
        const challenge = q.get("code_challenge");
        if (challenge === null || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return null;
        const resourceParam = q.get("resource");
        if (resourceParam !== null && resourceParam !== resource) return null;
        const scopes = scopesOf(q.get("scope"));
        return scopes ? { redirect, scopes, challenge, client: q.get("client_id")! } : null;
      })();
      if (!described) return err(400, "invalid_request", "the authorization request is not valid");
      const state = q.get("state");
      const back = (params: Record<string, string>) => {
        const u = new URL(described.redirect.href);
        for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
        if (state !== null) u.searchParams.set("state", state);
        u.searchParams.set("iss", issuer);
        return { status: 200, body: { redirect: u.href } };
      };
      if (body["approve"] !== true)
        return back({ error: "access_denied", error_description: "the person declined" });
      // each scope is granted only by the matching lane's own secret
      const granted: OAuthScope[] = [];
      for (const scope of described.scopes) {
        const typed = body[scope === "player" ? "player_token" : "referee_token"];
        if (typeof typed !== "string" || typed === "") continue;
        const checked = checkSecret(who, scope, typed);
        if (checked === "locked")
          return err(429, "temporarily_unavailable", "too many attempts: wait before trying again");
        if (checked === "ok") granted.push(scope);
      }
      if (granted.length === 0) return err(401, "access_denied", "no secret was accepted");
      const code = sign({
        t: "code",
        cid: described.client,
        ru: described.redirect.href,
        cc: described.challenge,
        sc: granted,
        jti: randomBytes(16).toString("hex"),
        gid: randomBytes(16).toString("hex"),
        exp: now() + CODE_MS,
      });
      return back({ code });
    },
    token: (form) => {
      const grant = form["grant_type"];
      const clientId = form["client_id"];
      if (!clientOf(clientId)) return err(401, "invalid_client", "unknown client");
      const issue = (scopes: readonly OAuthScope[], gid: string) => {
        const t = now();
        return {
          status: 200,
          body: {
            access_token: sign({
              t: "at",
              cid: clientId,
              sc: scopes,
              gid,
              aud: resource,
              exp: t + ACCESS_MS,
            }),
            token_type: "Bearer",
            expires_in: ACCESS_MS / 1000,
            refresh_token: sign({
              t: "rt",
              cid: clientId,
              sc: scopes,
              gid,
              jti: randomBytes(16).toString("hex"),
              exp: t + REFRESH_MS,
            }),
            scope: scopes.join(" "),
          },
        };
      };
      const scopesIn = (v: unknown): OAuthScope[] =>
        Array.isArray(v) ? v.filter((s): s is OAuthScope => OAUTH_SCOPES.some((o) => o === s)) : [];
      if (grant === "authorization_code") {
        const c = open(form["code"], "code");
        const verifier = form["code_verifier"];
        if (
          !c ||
          c["cid"] !== clientId ||
          typeof verifier !== "string" ||
          !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
          c["ru"] !== form["redirect_uri"] ||
          typeof c["cc"] !== "string" ||
          !safeEqual(c["cc"], createHash("sha256").update(verifier).digest("base64url")) ||
          typeof c["gid"] !== "string" ||
          !consume(c["jti"], c["exp"])
        )
          return err(400, "invalid_grant", "the authorization code is not valid");
        return issue(scopesIn(c["sc"]), c["gid"]);
      }
      if (grant === "refresh_token") {
        const r = open(form["refresh_token"], "rt");
        if (
          !r ||
          r["cid"] !== clientId ||
          typeof r["gid"] !== "string" ||
          !consume(r["jti"], r["exp"])
        )
          return err(400, "invalid_grant", "the refresh token is not valid");
        return issue(scopesIn(r["sc"]), r["gid"]);
      }
      return err(
        400,
        "unsupported_grant_type",
        "only authorization_code and refresh_token are supported",
      );
    },
    verifyAccess: (bearer) => {
      const a = open(bearer, "at");
      if (!a || a["aud"] !== resource || typeof a["cid"] !== "string") return null;
      const scopes = Array.isArray(a["sc"])
        ? (a["sc"] as unknown[]).filter((s): s is OAuthScope => OAUTH_SCOPES.some((o) => o === s))
        : [];
      return scopes.length > 0 && typeof a["gid"] === "string"
        ? { client: a["cid"], scopes, grant: a["gid"] }
        : null;
    },
  };
}
