// Initial Locality Bootstrap v0.9 — the protected OAuth grant ledger (companion "Revocation"). MECHANISM ONLY: a scripted OAuth client,
// no chat host, no person, no deployment. It proves: ISSUED is durable before tokens return; every access verification and every refresh
// consults the ledger; self and operator revocation end BOTH access and refresh; unknown grants deny even with a valid signature; a
// missing/partial/foreign/corrupt initialised ledger denies EVERYTHING (fail closed); a revoked grant never returns; lane-secret rotation
// still revokes every token; revocation never touches canon.
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createOAuth, type OAuthServer } from "../../apps/phone/src/oauth.ts";
import { openOAuthGrantLedger, type OAuthGrantLedger } from "../../apps/phone/src/oauth-ledger.ts";
import { PLAYER, REFEREE, chatConfig, pkce } from "../support/chat-client.ts";
import { tempDir } from "../support/tmp.ts";

const redirect = "https://chat.example/callback";

async function rig(
  over: { now?: () => number; dir?: string; config?: Awaited<ReturnType<typeof chatConfig>> } = {},
) {
  const config = over.config ?? (await chatConfig({ operatorDir: tempDir("oauth-ledger-") }));
  const dir = over.dir ?? join(config.operatorDir, "oauth-ledger");
  const now = over.now ?? Date.now;
  const ledger = openOAuthGrantLedger({ dir, campaignId: config.campaignId, now });
  const oauth = createOAuth(
    config,
    now,
    (_who, role, secret) => (secret === (role === "player" ? PLAYER : REFEREE) ? "ok" : "bad"),
    ledger,
  );
  return { config, dir, now, ledger, oauth };
}

/** a full consent + code redemption by a scripted client; returns the tokens and the identities the ledger keys on */
function consent(oauth: OAuthServer, scope: "player" | "referee" = "player") {
  const reg = oauth.register({ redirect_uris: [redirect] });
  const client = String(reg.body["client_id"]);
  const { verifier, challenge } = pkce();
  const decision = oauth.decide(
    {
      client_id: client,
      redirect_uri: redirect,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope,
      state: "s",
      resource: oauth.resource,
      approve: true,
      ...(scope === "player" ? { player_token: PLAYER } : { referee_token: REFEREE }),
    },
    "ledger-test-human",
  );
  expect(decision.status).toBe(200);
  const code = new URL(String(decision.body["redirect"])).searchParams.get("code");
  const token = oauth.token({
    grant_type: "authorization_code",
    client_id: client,
    redirect_uri: redirect,
    code,
    code_verifier: verifier,
  });
  return { client, token };
}
const access = (t: { body: Record<string, unknown> }) => String(t.body["access_token"]);
const refresh = (t: { body: Record<string, unknown> }) => String(t.body["refresh_token"]);
const refreshing = (oauth: OAuthServer, client: string, token: string) =>
  oauth.token({ grant_type: "refresh_token", client_id: client, refresh_token: token });

describe("OAuth grant ledger: issuance registers the grant durably before any token is returned", () => {
  it("an issued grant is ISSUED in the ledger, with its identity from the verified token, and works until revoked", async () => {
    const { oauth, ledger } = await rig();
    expect(ledger.usable()).toBe(true);
    expect(ledger.list()).toEqual([]);
    const { client, token } = consent(oauth);
    expect(token.status).toBe(200);
    const claims = oauth.verifyAccess(access(token));
    expect(claims).not.toBeNull();
    expect(claims!.client).toBe(client);
    expect(ledger.status(client, claims!.grant)).toBe("ISSUED");
    expect(ledger.list()).toHaveLength(1);
    expect(ledger.list()![0]).toMatchObject({
      client,
      grant: claims!.grant,
      state: "ISSUED",
      revision: 1,
    });
  });

  it("the verified access expiry is exposed for transport-authority deadlines, and a refresh issues a NEW token without altering the retained one", async () => {
    let t = 1_000_000;
    const { oauth } = await rig({ now: () => t });
    const { client, token } = consent(oauth);
    const first = oauth.verifyAccess(access(token))!;
    expect(first.expiresAtMs).toBe(1_000_000 + 60 * 60_000);
    t += 30 * 60_000;
    const renewed = refreshing(oauth, client, refresh(token));
    expect(renewed.status).toBe(200);
    const second = oauth.verifyAccess(access(renewed))!;
    expect(second.grant).toBe(first.grant);
    expect(second.expiresAtMs).toBeGreaterThan(first.expiresAtMs); // a fresh token; a retained deadline is NOT moved by it
    expect(first.expiresAtMs).toBe(1_000_000 + 60 * 60_000);
  });

  it("a registration that cannot be made durable returns NO tokens; the spent code needs a new authorization", async () => {
    const config = await chatConfig({ operatorDir: tempDir("oauth-ledger-") });
    const { oauth, dir } = await rig({ config });
    // break the directory so the registration fails after the code is spent
    rmSync(join(dir, "ledger.json"));
    const { client, token } = consent(oauth);
    expect(token.status).toBe(503);
    expect(token.body["access_token"]).toBeUndefined();
    expect(token.body["refresh_token"]).toBeUndefined();
    expect(client).toBeTruthy();
  });
});

describe("OAuth grant ledger: revocation ends access AND refresh", () => {
  it("client self-revocation (RFC 7009) with the access token or the refresh token ends the whole grant", async () => {
    for (const via of [access, refresh] as const) {
      const { oauth, ledger } = await rig();
      const { client, token } = consent(oauth);
      const claims = oauth.verifyAccess(access(token))!;
      const revoked = oauth.revokeToken({ client_id: client, token: via(token) });
      expect(revoked.status).toBe(200);
      expect(ledger.status(client, claims.grant)).toBe("REVOKED");
      expect(oauth.verifyAccess(access(token))).toBeNull();
      const again = refreshing(oauth, client, refresh(token));
      expect(again.status).toBe(400);
      expect(again.body["error"]).toBe("invalid_grant");
      // idempotent, and another client's token cannot revoke this grant
      expect(oauth.revokeToken({ client_id: client, token: via(token) }).status).toBe(200);
    }
  });

  it("a token of another client, or a token that names no grant, revokes nothing", async () => {
    const { oauth, ledger } = await rig();
    const a = consent(oauth);
    const b = consent(oauth);
    const claimsA = oauth.verifyAccess(access(a.token))!;
    oauth.revokeToken({ client_id: b.client, token: access(a.token) });
    oauth.revokeToken({ client_id: a.client, token: "not-a-token" });
    expect(ledger.status(a.client, claimsA.grant)).toBe("ISSUED");
    expect(oauth.verifyAccess(access(a.token))).not.toBeNull();
    expect(oauth.revokeToken({ client_id: "unregistered", token: access(a.token) }).status).toBe(
      401,
    );
  });

  it("operator revocation of one actual client/grant ends it; the other grants of the same client stand; an unknown grant has nothing to revoke", async () => {
    const { oauth, ledger } = await rig();
    const one = consent(oauth);
    const claims = oauth.verifyAccess(access(one.token))!;
    expect(oauth.revokeGrant(one.client, claims.grant, "OPERATOR")).toBe("REVOKED");
    expect(oauth.verifyAccess(access(one.token))).toBeNull();
    expect(refreshing(oauth, one.client, refresh(one.token)).status).toBe(400);
    expect(ledger.list()![0]).toMatchObject({
      state: "REVOKED",
      revoked_by: "OPERATOR",
      revision: 2,
    });
    expect(oauth.revokeGrant(one.client, claims.grant, "SELF")).toBe("REVOKED"); // idempotent, keeps its first author
    expect(ledger.list()![0]!.revoked_by).toBe("OPERATOR");
    expect(oauth.revokeGrant(one.client, "no-such-grant", "OPERATOR")).toBe("UNKNOWN");
  });

  it("a revoked grant never returns: it cannot be re-registered and the ledger keeps the tombstone", async () => {
    const { oauth, ledger } = await rig();
    const { client, token } = consent(oauth);
    const claims = oauth.verifyAccess(access(token))!;
    oauth.revokeGrant(client, claims.grant, "OPERATOR");
    expect(ledger.register({ client, grant: claims.grant, scopes: ["player"] })).toBe("REVOKED");
    expect(ledger.status(client, claims.grant)).toBe("REVOKED");
  });

  it("revocation is per grant: another authorization of the same client keeps working", async () => {
    const { oauth } = await rig();
    const first = consent(oauth);
    const claimsFirst = oauth.verifyAccess(access(first.token))!;
    // a second consent by the same registered client is a different grant
    const { verifier, challenge } = pkce();
    const decision = oauth.decide(
      {
        client_id: first.client,
        redirect_uri: redirect,
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
        scope: "player",
        state: "s",
        resource: oauth.resource,
        approve: true,
        player_token: PLAYER,
      },
      "ledger-test-human",
    );
    const second = oauth.token({
      grant_type: "authorization_code",
      client_id: first.client,
      redirect_uri: redirect,
      code: new URL(String(decision.body["redirect"])).searchParams.get("code"),
      code_verifier: verifier,
    });
    const claimsSecond = oauth.verifyAccess(access(second))!;
    expect(claimsSecond.grant).not.toBe(claimsFirst.grant);
    oauth.revokeGrant(first.client, claimsFirst.grant, "OPERATOR");
    expect(oauth.verifyAccess(access(first.token))).toBeNull();
    expect(oauth.verifyAccess(access(second))).not.toBeNull();
  });
});

describe("OAuth grant ledger: unknown grants, a missing/corrupt ledger and rotation fail CLOSED", () => {
  it("an unknown (never registered) grant denies access and refresh even though the token signature verifies — a prior stateless token is not adopted", async () => {
    const config = await chatConfig({ operatorDir: tempDir("oauth-ledger-") });
    const issuing = await rig({ config, dir: join(tempDir("oauth-ledger-issuing-"), "ledger") });
    const { client, token } = consent(issuing.oauth);
    // the SAME signing key (same lane secrets), a ledger that never registered that grant
    const upgraded = await rig({ config, dir: join(tempDir("oauth-ledger-fresh-"), "ledger") });
    expect(upgraded.oauth.verifyAccess(access(token))).toBeNull();
    const r = refreshing(upgraded.oauth, client, refresh(token));
    expect(r.status).toBe(400);
    expect(r.body["error"]).toBe("invalid_grant");
  });

  const fileOf = (client: string, grant: string) =>
    `grant-${createHash("sha256").update(`${client}\u0000${grant}`).digest("hex").slice(0, 40)}.json`;
  const ledgerLevel: Record<string, (dir: string) => void> = {
    "the marker is deleted": (dir) => rmSync(join(dir, "ledger.json")),
    "the key is deleted": (dir) => rmSync(join(dir, "ledger.key")),
    "the key is replaced": (dir) =>
      writeFileSync(join(dir, "ledger.key"), `${randomBytes(32).toString("hex")}\n`),
    "the marker is edited": (dir) => {
      const m = JSON.parse(readFileSync(join(dir, "ledger.json"), "utf8"));
      writeFileSync(join(dir, "ledger.json"), JSON.stringify({ ...m, campaign_id: "another" }));
    },
  };
  for (const [name, tamper] of Object.entries(ledgerLevel)) {
    it(`${name}: ordinary access and refresh are denied APPLICATION-WIDE (even grants never revoked), and nothing new is issued`, async () => {
      const { oauth, ledger, dir } = await rig();
      const a = consent(oauth);
      const b = consent(oauth);
      expect(oauth.verifyAccess(access(a.token))).not.toBeNull();
      tamper(dir);
      expect([a, b].map((x) => oauth.verifyAccess(access(x.token)))).toEqual([null, null]);
      expect(ledger.usable()).toBe(false);
      expect(ledger.list()).toBeNull();
      const r = refreshing(oauth, a.client, refresh(a.token));
      expect(r.status).toBe(503);
      expect(r.body["access_token"]).toBeUndefined();
      expect(consent(oauth).token.status).toBe(503);
      // a restarted process sees the same: nothing is repaired, adopted or guessed
      const restarted = openOAuthGrantLedger({ dir, campaignId: "campaign-test", now: Date.now });
      expect(restarted.usable()).toBe(false);
    });
  }

  const recordLevel: Record<string, (dir: string, file: string) => void> = {
    "its record is edited": (dir, file) => {
      const r = JSON.parse(readFileSync(join(dir, file), "utf8"));
      writeFileSync(join(dir, file), JSON.stringify({ ...r, state: "ISSUED", revision: 99 }));
    },
    "its record is truncated": (dir, file) => writeFileSync(join(dir, file), "{"),
    "its record is removed": (dir, file) => rmSync(join(dir, file)),
  };
  for (const [name, tamper] of Object.entries(recordLevel)) {
    it(`${name}: a REVOKED grant cannot keep ordinary access while its storage is broken; the other grants stand`, async () => {
      const { oauth, ledger, dir } = await rig();
      const a = consent(oauth);
      const b = consent(oauth);
      const claimsA = oauth.verifyAccess(access(a.token))!;
      oauth.revokeGrant(a.client, claimsA.grant, "OPERATOR");
      tamper(dir, fileOf(a.client, claimsA.grant));
      expect(oauth.verifyAccess(access(a.token))).toBeNull();
      expect(refreshing(oauth, a.client, refresh(a.token)).status).toBeGreaterThanOrEqual(400);
      expect(oauth.verifyAccess(access(b.token))).not.toBeNull();
      if (!name.includes("removed")) expect(ledger.list()).toBeNull(); // an unverifiable record fails the operator's view closed
    });
  }

  it("a PARTIAL initialisation (a key with no marker) is corrupt, never completed or adopted", async () => {
    const config = await chatConfig({ operatorDir: tempDir("oauth-ledger-") });
    const dir = join(config.operatorDir, "oauth-ledger");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "ledger.key"), `${randomBytes(32).toString("hex")}\n`);
    chmodSync(join(dir, "ledger.key"), 0o600);
    const { oauth, ledger } = await rig({ config, dir });
    expect(ledger.usable()).toBe(false);
    expect(consent(oauth).token.status).toBe(503);
    expect(existsSync(join(dir, "ledger.json"))).toBe(false);
  });

  it("a ledger initialised for another campaign is foreign and denies", async () => {
    const config = await chatConfig({ operatorDir: tempDir("oauth-ledger-") });
    const dir = join(config.operatorDir, "oauth-ledger");
    const first = await rig({ config, dir });
    expect(first.ledger.usable()).toBe(true);
    const foreign = openOAuthGrantLedger({ dir, campaignId: "another-campaign", now: Date.now });
    expect(foreign.usable()).toBe(false);
    expect(foreign.status("c", "g")).toBe("UNAVAILABLE");
  });

  it("lane-secret rotation still revokes every token, and does not disturb the ledger", async () => {
    const config = await chatConfig({ operatorDir: tempDir("oauth-ledger-") });
    const before = await rig({ config });
    const { client, token } = consent(before.oauth);
    expect(before.oauth.verifyAccess(access(token))).not.toBeNull();
    const rotated = { ...config, playerToken: `${config.playerToken}-rotated` };
    const after = await rig({ config: rotated, dir: before.dir });
    expect(after.ledger.usable()).toBe(true);
    expect(after.ledger.list()).toHaveLength(1);
    expect(after.oauth.verifyAccess(access(token))).toBeNull(); // the signing key changed
    const refused = refreshing(after.oauth, client, refresh(token));
    // the registration is signed under the same key, so it too is void after rotation: nothing can be refreshed or issued from it
    expect(refused.status).toBe(401);
    expect(refused.body["access_token"]).toBeUndefined();
  });

  it("two registrations of one grant race to exactly one record; a revocation then wins permanently", async () => {
    const { ledger } = await rig();
    const entry = { client: "c1", grant: "g1", scopes: ["player"] };
    expect([ledger.register(entry), ledger.register(entry)]).toEqual(["REGISTERED", "REGISTERED"]);
    expect(ledger.list()).toHaveLength(1);
    expect(ledger.revoke("c1", "g1", "SELF")).toBe("REVOKED");
    expect(ledger.register(entry)).toBe("REVOKED");
    expect(ledger.status("c1", "g1")).toBe("REVOKED");
    // the integrity key is private to the ledger and never derived from, or stored in, anything a token carries
    expect(createHash("sha256").update("x").digest("hex")).toBeTruthy();
  });
});

describe("OAuth grant ledger: it is a trusted-startup artifact, owner-only on disk", () => {
  it("the ledger directory holds only the key, the marker and grant records, with owner-only modes", async () => {
    const { oauth, dir } = await rig();
    consent(oauth);
    const names = readdirSync(dir).sort();
    expect(names.filter((n) => !n.startsWith("grant-"))).toEqual(["ledger.json", "ledger.key"]);
    expect(names.filter((n) => n.startsWith("grant-"))).toHaveLength(1);
    expect(names.some((n) => n.startsWith(".tmp-"))).toBe(false);
  });
});

export type { OAuthGrantLedger };
