// Unit evidence for the trusted player-view host binding (BLUE v5.2 bounded brief 2026-10-15): what a bound host's secret proves and what it
// cannot, the digest-only configuration, and the owner-only secret file. The binding confers no role or permission and names no authority.
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { nodeFs } from "@immortalis/engine";
import { describe, expect, it } from "vitest";
import {
  PLAYER_VIEW_CONFIG_FORMAT,
  authorizePlayerViewHost,
  bindPlayerViewHost,
  playerViewDir,
  playerViewSecretPath,
  readPlayerViewConfig,
  readPlayerViewSecretFile,
} from "../../packages/operator/src/player-view-exchange.ts";
import { tempDir } from "../support/tmp.ts";

const UID = process.getuid!();
const stateDir = () => {
  const d = tempDir("immortalis-pv-exchange-");
  chmodSync(d, 0o700);
  return d;
};
const params = (dir: string, campaignId = "campaign-a") => ({ stateDir: dir, campaignId });
const bind = (dir: string, hostId: string, pcId = "pc-1", campaignId = "campaign-a") =>
  bindPlayerViewHost({ ...params(dir, campaignId), operatorUid: UID, hostId, pcId });

describe("binding a host", () => {
  it("writes an owner-only secret file and a digest-only configuration naming the one character", async () => {
    const dir = stateDir();
    const bound = await bind(dir, "host-1");
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const secret = readFileSync(bound.value.secret_file, "utf8").trim();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(bound.value.secret_file).toBe(playerViewSecretPath(params(dir), "host-1"));
    expect(statSync(bound.value.secret_file).mode & 0o777).toBe(0o600);
    expect(statSync(playerViewDir(params(dir))).mode & 0o777).toBe(0o700);
    const config = await readPlayerViewConfig(params(dir), UID);
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    expect(config.value.format).toBe(PLAYER_VIEW_CONFIG_FORMAT);
    expect(config.value.hosts).toEqual([
      { host_id: "host-1", secret_sha256: expect.stringMatching(/^[0-9a-f]{64}$/), pc_id: "pc-1" },
    ]);
    // the configuration never holds the secret itself, and names no role or permission
    const text = readFileSync(join(playerViewDir(params(dir)), "config.json"), "utf8");
    expect(text).not.toContain(secret);
    expect(text).not.toMatch(/role|permission/);
  });

  it("refuses a duplicate host, a bad identity and a ninth host, and changes nothing when it refuses", async () => {
    const dir = stateDir();
    expect((await bind(dir, "host-1")).ok).toBe(true);
    const before = readFileSync(join(playerViewDir(params(dir)), "config.json"), "utf8");
    const duplicate = await bind(dir, "host-1");
    expect(!duplicate.ok && duplicate.error.code).toBe("HOST_EXISTS");
    for (const hostId of ["", "../x", "a b", "-lead", "x".repeat(65)])
      expect((await bind(dir, hostId)).ok, hostId).toBe(false);
    for (const pcId of ["", "-", "../x", "a b"])
      expect((await bind(dir, "h", pcId)).ok, pcId).toBe(false);
    expect(readFileSync(join(playerViewDir(params(dir)), "config.json"), "utf8")).toBe(before);
    for (let i = 2; i <= 8; i += 1) expect((await bind(dir, `host-${i}`)).ok).toBe(true);
    const ninth = await bind(dir, "host-9");
    expect(!ninth.ok && ninth.error.code).toBe("CONFIG_INVALID");
    // refused before any secret was drawn: no secret file exists for it
    expect(existsSync(playerViewSecretPath(params(dir), "host-9"))).toBe(false);
  });
});

describe("authorizing a host", () => {
  it("accepts only the bound host holding its own secret, and returns only the bound character", async () => {
    const dir = stateDir();
    const a = await bind(dir, "host-a", "pc-a");
    const b = await bind(dir, "host-b", "pc-b");
    if (!a.ok || !b.ok) throw new Error("bind failed");
    const secretA = readFileSync(a.value.secret_file, "utf8").trim();
    const secretB = readFileSync(b.value.secret_file, "utf8").trim();
    const ok = await authorizePlayerViewHost(params(dir), UID, "host-a", secretA);
    expect(ok).toEqual({ ok: true, value: { pc_id: "pc-a" } });
    expect((await authorizePlayerViewHost(params(dir), UID, "host-b", secretB)).ok).toBe(true);
    for (const [host, secret] of [
      ["host-a", secretB], // another host's secret
      ["host-b", secretA],
      ["host-c", secretA], // an unbound host
      ["host-a", "ab".repeat(32)], // a well-formed wrong secret
      ["host-a", ""], // malformed secrets
      ["host-a", secretA.toUpperCase()],
      ["host-a", `${secretA} `],
      ["host-a", secretA.slice(1)],
      ["", secretA],
    ] as const) {
      const r = await authorizePlayerViewHost(params(dir), UID, host, secret);
      expect(r.ok, `${host} ${secret.slice(0, 6)}`).toBe(false);
      // every refusal says the same thing: nothing distinguishes an unknown host from a wrong secret
      expect(!r.ok && r.error.message).toBe("the player-view host is not authorized");
    }
  });

  it("a secret of another campaign, an unconfigured campaign and another operating-system user are not authorized", async () => {
    const dir = stateDir();
    const a = await bind(dir, "host-a", "pc-a", "campaign-a");
    const other = await bind(dir, "host-a", "pc-a", "campaign-b");
    if (!a.ok || !other.ok) throw new Error("bind failed");
    const secretA = readFileSync(a.value.secret_file, "utf8").trim();
    const secretB = readFileSync(other.value.secret_file, "utf8").trim();
    expect(secretA).not.toBe(secretB);
    expect(
      (await authorizePlayerViewHost(params(dir, "campaign-b"), UID, "host-a", secretA)).ok,
    ).toBe(false);
    expect(
      (await authorizePlayerViewHost(params(dir, "campaign-b"), UID, "host-a", secretB)).ok,
    ).toBe(true);
    expect(
      (await authorizePlayerViewHost(params(dir, "campaign-c"), UID, "host-a", secretA)).ok,
    ).toBe(false);
    expect((await authorizePlayerViewHost(params(dir), UID + 1, "host-a", secretA)).ok).toBe(false);
  });

  it("a corrupt or foreign configuration is refused, never partly trusted", async () => {
    const dir = stateDir();
    const a = await bind(dir, "host-a");
    if (!a.ok) throw new Error("bind failed");
    const secret = readFileSync(a.value.secret_file, "utf8").trim();
    const config = join(playerViewDir(params(dir)), "config.json");
    const doc = JSON.parse(readFileSync(config, "utf8"));
    for (const broken of [
      "{",
      "[]",
      JSON.stringify({ ...doc, extra: 1 }),
      JSON.stringify({ ...doc, hosts: [{ ...doc.hosts[0], role: "role.x" }] }),
      JSON.stringify({ ...doc, hosts: [{ ...doc.hosts[0], secret_sha256: "zz" }] }),
      JSON.stringify({ ...doc, hosts: new Array(9).fill(doc.hosts[0]) }),
    ]) {
      writeFileSync(config, broken);
      expect((await authorizePlayerViewHost(params(dir), UID, "host-a", secret)).ok, broken).toBe(
        false,
      );
    }
  });
});

describe("the secret file", () => {
  const make = (mode: number, text: string) => {
    const dir = tempDir("immortalis-pv-secret-");
    const file = join(dir, "h.secret");
    writeFileSync(file, text);
    chmodSync(file, mode);
    return { dir, file };
  };
  const SECRET = "0123456789abcdef".repeat(4);

  it("reads only an owner-only regular file holding exactly one well-formed secret", () => {
    expect(readPlayerViewSecretFile(make(0o600, `${SECRET}\n`).file)).toBe(SECRET);
    expect(readPlayerViewSecretFile(make(0o400, SECRET).file)).toBe(SECRET);
    for (const [mode, text] of [
      [0o640, SECRET],
      [0o604, SECRET],
      [0o644, SECRET],
      [0o600, "short"],
      [0o600, SECRET.toUpperCase()],
      [0o600, `${SECRET}\n${"x".repeat(300)}`],
      [0o600, ""],
    ] as const)
      expect(
        readPlayerViewSecretFile(make(mode, text).file),
        `${mode.toString(8)} ${text.length}`,
      ).toBeNull();
  });

  it("never follows a symbolic link and reports an absent file as unreadable", () => {
    const { dir, file } = make(0o600, SECRET);
    const link = join(dir, "link.secret");
    symlinkSync(file, link);
    expect(readPlayerViewSecretFile(link)).toBeNull();
    expect(readPlayerViewSecretFile(join(dir, "absent"))).toBeNull();
    mkdirSync(join(dir, "adir"));
    expect(readPlayerViewSecretFile(join(dir, "adir"))).toBeNull();
  });
});

// PR91: configuration recovery retains the original private binding intent, never adopts an orphan key for another actor.
it("recovers a partial credential/config publication only for the exact original actor", async () => {
  const dir = stateDir();
  const p = { ...params(dir), operatorUid: UID, hostId: "host-partial", pcId: "pc-original" };
  const interrupted = await bindPlayerViewHost({
    ...p,
    fs: {
      ...nodeFs,
      writeFileDurable: async () => {
        throw new Error("reply lost before config");
      },
    },
  });
  expect(interrupted.ok).toBe(false);
  expect(readPlayerViewSecretFile(playerViewSecretPath(p, p.hostId))).not.toBeNull();
  const other = await bindPlayerViewHost({ ...p, pcId: "pc-other" });
  expect(!other.ok && other.error.code).toBe("CONFIG_INVALID");
  const intentPath = join(playerViewDir(p), `${p.hostId}.bind-intent.json`);
  const key = readPlayerViewSecretFile(playerViewSecretPath(p, p.hostId))!;
  expect(readFileSync(intentPath, "utf8").includes(key)).toBe(false);
  const recovered = await bindPlayerViewHost(p);
  expect(recovered.ok).toBe(true);
  const config = await readPlayerViewConfig(p, UID);
  expect(config.ok && config.value.hosts.map((h) => [h.host_id, h.pc_id])).toEqual([
    ["host-partial", "pc-original"],
  ]);
});
it("does not adopt a credential without its original intent or read a symlinked intent", async () => {
  const dir = stateDir();
  const p = { ...params(dir), operatorUid: UID, hostId: "host-orphan", pcId: "pc-original" };
  mkdirSync(playerViewDir(p), { mode: 0o700 });
  const orphan = playerViewSecretPath(p, p.hostId);
  writeFileSync(orphan, "ab".repeat(32) + "\n", { mode: 0o600 });
  expect((await bindPlayerViewHost(p)).ok).toBe(false);
  expect((await readPlayerViewConfig(p, UID)).ok).toBe(false);
  const other = { ...p, hostId: "host-link" };
  const target = join(dir, "untrusted-intent.json");
  writeFileSync(target, "{}", { mode: 0o600 });
  symlinkSync(target, join(playerViewDir(other), `${other.hostId}.bind-intent.json`));
  expect((await bindPlayerViewHost(other)).ok).toBe(false);
});

for (const publication of ["intent", "secret", "digest"] as const)
  it(`recovers a lost ${publication} publication acknowledgement before private chmod without relaxing credential reads`, async () => {
    const dir = stateDir();
    const p = { ...params(dir), operatorUid: UID, hostId: "host-interrupted", pcId: "pc-original" };
    let fired = false;
    const matches = (path: string) =>
      publication === "secret" ? path.endsWith(".secret") : path.endsWith(".bind-intent.json");
    const method = publication === "digest" ? "writeFileDurable" : "createExclusive";
    const original = nodeFs[method];
    const broken = {
      ...nodeFs,
      [method]: async (path: string, data: string | Buffer) => {
        await original(path, data as string);
        if (!fired && matches(path)) {
          fired = true;
          throw new Error("acknowledgement lost before chmod");
        }
      },
    };
    expect((await bindPlayerViewHost({ ...p, fs: broken })).ok).toBe(false);
    expect(fired).toBe(true);
    const secretFile = playerViewSecretPath(p, p.hostId);
    const key = existsSync(secretFile) ? readFileSync(secretFile, "utf8").trim() : null;
    // Exercise the runner's 022 publication window explicitly, independent of the local process umask.
    chmodSync(
      publication === "secret"
        ? secretFile
        : join(playerViewDir(p), `${p.hostId}.bind-intent.json`),
      0o644,
    );
    expect((await bindPlayerViewHost({ ...p, pcId: "pc-other" })).ok).toBe(false);
    if (publication === "secret") expect(readPlayerViewSecretFile(secretFile)).toBeNull();
    expect((await bindPlayerViewHost(p)).ok).toBe(true);
    if (key) expect(readPlayerViewSecretFile(secretFile)).toBe(key);
    for (const path of [secretFile, join(playerViewDir(p), `${p.hostId}.bind-intent.json`)])
      expect(statSync(path).mode & 0o777).toBe(0o600);
  });
it("never repairs a group-writable binding intent or credential", async () => {
  for (const kind of ["intent", "secret"]) {
    const dir = stateDir();
    const p = { ...params(dir), operatorUid: UID, hostId: "host-unsafe", pcId: "pc-original" };
    await bindPlayerViewHost({
      ...p,
      fs: {
        ...nodeFs,
        writeFileDurable: async () => {
          throw new Error("unpublished configuration");
        },
      },
    });
    const file =
      kind === "intent"
        ? join(playerViewDir(p), `${p.hostId}.bind-intent.json`)
        : playerViewSecretPath(p, p.hostId);
    chmodSync(file, 0o660);
    expect((await bindPlayerViewHost(p)).ok).toBe(false);
    expect(statSync(file).mode & 0o777).toBe(0o660);
  }
});
