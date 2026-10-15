// Unit evidence for the trusted observation-REQUEST routing state (BLUE v5.2-A1 bounded brief 2026-10-15): what a bound host's secret proves and
// what it cannot, the digest-only configuration, the owner-only secret file, and the ONE pending ask (idempotent, replaced when stale, discarded
// only by identity). A request binding confers no role or permission, is not authorization to act, and is entirely separate from the
// player-view (read) binding and the referee exchange.
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeFs, type FsOps } from "@immortalis/engine";
import {
  OBSERVE_REQUEST_CONFIG_FORMAT,
  authorizeObserveRequestHost,
  bindObserveRequestHost,
  discardObserveRequest,
  observeRequestDir,
  observeRequestSecretPath,
  readObserveRequest,
  readObserveRequestConfig,
  readObserveRequestSecretFile,
  recordObserveRequest,
} from "../../packages/operator/src/observe-request-exchange.ts";
import { playerViewDir } from "../../packages/operator/src/player-view-exchange.ts";
import { tempDir } from "../support/tmp.ts";

const UID = process.getuid!();
const stateDir = () => {
  const d = tempDir("immortalis-obs-request-exchange-");
  chmodSync(d, 0o700);
  return d;
};
const params = (dir: string, campaignId = "campaign-a") => ({ stateDir: dir, campaignId });
const bind = (dir: string, hostId: string, pcId = "pc-1", campaignId = "campaign-a") =>
  bindObserveRequestHost({ ...params(dir, campaignId), operatorUid: UID, hostId, pcId });
const ask = (host_id = "host-1", pc_id = "pc-1", value = 100, campaign_id = "campaign-a") => ({
  campaign_id,
  operator_uid: UID,
  host_id,
  pc_id,
  basis: { unit: "tick", value },
});

describe("binding a host", () => {
  it("writes an owner-only secret file and a digest-only configuration naming the one character, in a directory of its own", async () => {
    const dir = stateDir();
    const bound = await bind(dir, "host-1");
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const secret = readFileSync(bound.value.secret_file, "utf8").trim();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(bound.value.secret_file).toBe(observeRequestSecretPath(params(dir), "host-1"));
    expect(statSync(bound.value.secret_file).mode & 0o777).toBe(0o600);
    expect(statSync(observeRequestDir(params(dir))).mode & 0o777).toBe(0o700);
    // not the read (player-view) binding's directory
    expect(observeRequestDir(params(dir))).not.toBe(playerViewDir(params(dir)));
    expect(existsSync(playerViewDir(params(dir)))).toBe(false);
    const config = await readObserveRequestConfig(params(dir), UID);
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    expect(config.value.format).toBe(OBSERVE_REQUEST_CONFIG_FORMAT);
    expect(config.value.hosts).toEqual([
      { host_id: "host-1", secret_sha256: expect.stringMatching(/^[0-9a-f]{64}$/), pc_id: "pc-1" },
    ]);
    const text = readFileSync(join(observeRequestDir(params(dir)), "config.json"), "utf8");
    expect(text).not.toContain(secret);
    expect(text).not.toMatch(/role|permission|confirm/);
  });

  it("refuses a duplicate host, a bad identity and a ninth host, and changes nothing when it refuses", async () => {
    const dir = stateDir();
    expect((await bind(dir, "host-1")).ok).toBe(true);
    const before = readFileSync(join(observeRequestDir(params(dir)), "config.json"), "utf8");
    const duplicate = await bind(dir, "host-1");
    expect(!duplicate.ok && duplicate.error.code).toBe("HOST_EXISTS");
    for (const hostId of ["", "../x", "a b", "-lead", "x".repeat(65)])
      expect((await bind(dir, hostId)).ok, hostId).toBe(false);
    for (const pcId of ["", "-", "../x", "a b"])
      expect((await bind(dir, "h", pcId)).ok, pcId).toBe(false);
    expect(readFileSync(join(observeRequestDir(params(dir)), "config.json"), "utf8")).toBe(before);
    for (let i = 2; i <= 8; i += 1) expect((await bind(dir, `host-${i}`)).ok).toBe(true);
    const ninth = await bind(dir, "host-9");
    expect(!ninth.ok && ninth.error.code).toBe("CONFIG_INVALID");
    expect(existsSync(observeRequestSecretPath(params(dir), "host-9"))).toBe(false);
  });
});

describe("authorizing a host (entitlement to ask, never authorization to act)", () => {
  it("accepts only the bound host holding its own secret, and returns only the bound character", async () => {
    const dir = stateDir();
    const a = await bind(dir, "host-a", "pc-a");
    const b = await bind(dir, "host-b", "pc-b");
    if (!a.ok || !b.ok) throw new Error("bind failed");
    const secretA = readFileSync(a.value.secret_file, "utf8").trim();
    const secretB = readFileSync(b.value.secret_file, "utf8").trim();
    expect(await authorizeObserveRequestHost(params(dir), UID, "host-a", secretA)).toEqual({
      ok: true,
      value: { pc_id: "pc-a" },
    });
    for (const [host, secret] of [
      ["host-a", secretB],
      ["host-b", secretA],
      ["host-c", secretA],
      ["host-a", "ab".repeat(32)],
      ["host-a", ""],
      ["host-a", secretA.toUpperCase()],
      ["host-a", `${secretA} `],
      ["host-a", secretA.slice(1)],
      ["", secretA],
    ] as const) {
      const r = await authorizeObserveRequestHost(params(dir), UID, host, secret);
      expect(r.ok, `${host} ${secret.slice(0, 6)}`).toBe(false);
      expect(!r.ok && r.error.message).toBe("the observation-request host is not authorized");
    }
  });

  it("a secret of another campaign, an unconfigured campaign and another operating-system user are not authorized", async () => {
    const dir = stateDir();
    const a = await bind(dir, "host-a", "pc-a", "campaign-a");
    const other = await bind(dir, "host-a", "pc-a", "campaign-b");
    if (!a.ok || !other.ok) throw new Error("bind failed");
    const secretA = readFileSync(a.value.secret_file, "utf8").trim();
    const secretB = readFileSync(other.value.secret_file, "utf8").trim();
    expect(
      (await authorizeObserveRequestHost(params(dir, "campaign-b"), UID, "host-a", secretA)).ok,
    ).toBe(false);
    expect(
      (await authorizeObserveRequestHost(params(dir, "campaign-b"), UID, "host-a", secretB)).ok,
    ).toBe(true);
    expect(
      (await authorizeObserveRequestHost(params(dir, "campaign-c"), UID, "host-a", secretA)).ok,
    ).toBe(false);
    expect((await authorizeObserveRequestHost(params(dir), UID + 1, "host-a", secretA)).ok).toBe(
      false,
    );
  });

  it("a corrupt or foreign configuration is refused, never partly trusted", async () => {
    const dir = stateDir();
    const a = await bind(dir, "host-a");
    if (!a.ok) throw new Error("bind failed");
    const secret = readFileSync(a.value.secret_file, "utf8").trim();
    const config = join(observeRequestDir(params(dir)), "config.json");
    const doc = JSON.parse(readFileSync(config, "utf8"));
    for (const broken of [
      "{",
      "[]",
      JSON.stringify({ ...doc, extra: 1 }),
      JSON.stringify({ ...doc, hosts: [{ ...doc.hosts[0], role: "role.player" }] }),
      JSON.stringify({ ...doc, hosts: [{ ...doc.hosts[0], secret_sha256: "zz" }] }),
      JSON.stringify({ ...doc, hosts: new Array(9).fill(doc.hosts[0]) }),
    ]) {
      writeFileSync(config, broken);
      expect(
        (await authorizeObserveRequestHost(params(dir), UID, "host-a", secret)).ok,
        broken,
      ).toBe(false);
    }
  });
});

describe("the secret file", () => {
  const make = (mode: number, text: string) => {
    const dir = tempDir("immortalis-obs-request-secret-");
    const file = join(dir, "h.secret");
    writeFileSync(file, text);
    chmodSync(file, mode);
    return { dir, file };
  };
  const SECRET = "0123456789abcdef".repeat(4);

  it("reads only an owner-only regular file holding exactly one well-formed secret", () => {
    expect(readObserveRequestSecretFile(make(0o600, `${SECRET}\n`).file)).toBe(SECRET);
    for (const [mode, text] of [
      [0o640, SECRET],
      [0o604, SECRET],
      [0o600, "short"],
      [0o600, SECRET.toUpperCase()],
      [0o600, `${SECRET}\n${"x".repeat(300)}`],
      [0o600, ""],
    ] as const)
      expect(readObserveRequestSecretFile(make(mode, text).file), `${mode.toString(8)}`).toBeNull();
  });

  it("never follows a symbolic link and reports an absent file or a directory as unreadable", () => {
    const { dir, file } = make(0o600, SECRET);
    const link = join(dir, "link.secret");
    symlinkSync(file, link);
    expect(readObserveRequestSecretFile(link)).toBeNull();
    expect(readObserveRequestSecretFile(join(dir, "absent"))).toBeNull();
    mkdirSync(join(dir, "adir"));
    expect(readObserveRequestSecretFile(join(dir, "adir"))).toBeNull();
  });
});

describe("the one pending ask", () => {
  it("is recorded once, is idempotent for the same character and basis whoever asks, and carries no choice", async () => {
    const dir = stateDir();
    const first = await recordObserveRequest(params(dir), ask("host-1"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = await recordObserveRequest(params(dir), ask("host-1"));
    const other = await recordObserveRequest(params(dir), ask("host-2"));
    expect(again).toEqual(first);
    expect(other).toEqual(first);
    const held = await readObserveRequest(params(dir), UID);
    expect(held.ok && held.value).toMatchObject({ host_id: "host-1", pc_id: "pc-1" });
    const files = readdirSync(observeRequestDir(params(dir)));
    expect(files).toEqual(["request.json"]);
    const text = readFileSync(join(observeRequestDir(params(dir)), "request.json"), "utf8");
    expect(text).not.toMatch(/confirm|verdict|role\.|permission/i);
    expect(statSync(join(observeRequestDir(params(dir)), "request.json")).mode & 0o777).toBe(0o600);
  });

  it("an ask for another basis or character is stale and is replaced by the new one", async () => {
    const dir = stateDir();
    const a = await recordObserveRequest(params(dir), ask("host-1", "pc-1", 100));
    const b = await recordObserveRequest(params(dir), ask("host-1", "pc-1", 150));
    const c = await recordObserveRequest(params(dir), ask("host-1", "pc-2", 150));
    if (!a.ok || !b.ok || !c.ok) throw new Error("record failed");
    expect(new Set([a.value.request_id, b.value.request_id, c.value.request_id]).size).toBe(3);
    const held = await readObserveRequest(params(dir), UID);
    expect(held.ok && held.value?.request_id).toBe(c.value.request_id);
  });

  it("concurrent recorders converge on one ask", async () => {
    const dir = stateDir();
    const all = await Promise.all(
      Array.from({ length: 8 }, (_, i) => recordObserveRequest(params(dir), ask(`host-${i}`))),
    );
    const ids = new Set(all.map((r) => (r.ok ? r.value.request_id : "fail")));
    expect(ids.size).toBe(1);
    expect(ids.has("fail")).toBe(false);
  });

  it("is discarded only by its own identity, and an unrecognised file is never overwritten", async () => {
    const dir = stateDir();
    const a = await recordObserveRequest(params(dir), ask());
    if (!a.ok) throw new Error("record failed");
    expect(await discardObserveRequest(params(dir), "0".repeat(32), UID)).toBe(false);
    expect((await readObserveRequest(params(dir), UID)).ok).toBe(true);
    expect(await discardObserveRequest(params(dir), a.value.request_id, UID)).toBe(true);
    expect(await readObserveRequest(params(dir), UID)).toEqual({ ok: true, value: null });
    // an unrecognised file (wrong shape, another operator, another campaign) is invalid and is not overwritten
    const file = join(observeRequestDir(params(dir)), "request.json");
    for (const text of ["{", "[]", JSON.stringify({ format: "x" })]) {
      writeFileSync(file, text);
      const r = await readObserveRequest(params(dir), UID);
      expect(!r.ok && r.error.code).toBe("REQUEST_INVALID");
      const recorded = await recordObserveRequest(params(dir), ask());
      expect(recorded.ok).toBe(false);
      expect(readFileSync(file, "utf8")).toBe(text);
    }
    writeFileSync(file, readFileSync(file, "utf8"));
  });

  it("an ask of another operating-system user or campaign is not this operator's", async () => {
    const dir = stateDir();
    expect((await recordObserveRequest(params(dir), ask())).ok).toBe(true);
    const wrongUid = await readObserveRequest(params(dir), UID + 1);
    expect(!wrongUid.ok && wrongUid.error.code).toBe("REQUEST_INVALID");
    const wrongCampaign = await readObserveRequest(params(dir, "campaign-b"), UID);
    expect(wrongCampaign).toEqual({ ok: true, value: null });
  });

  it("an I/O failure while recording is the one failure and leaves no partial ask", async () => {
    const dir = stateDir();
    const fs: FsOps = {
      ...nodeFs,
      createExclusive: async () => {
        throw new Error("injected");
      },
    };
    const r = await recordObserveRequest({ ...params(dir), fs }, ask());
    expect(!r.ok && r.error.code).toBe("IO_FAILED");
    expect(readdirSync(observeRequestDir(params(dir)))).toEqual([]);
  });
});
