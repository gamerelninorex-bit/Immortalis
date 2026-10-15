// Unit evidence for the trusted time-advance-REQUEST routing state (BLUE v5.2-A1 bounded brief 2026-10-15): what a bound host's secret proves and
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
  ADVANCE_REQUEST_CONFIG_FORMAT,
  authorizeAdvanceRequestHost,
  bindAdvanceRequestHost,
  discardAdvanceRequest,
  listAdvanceRequests,
  advanceRequestDir,
  advanceRequestSecretPath,
  readAdvanceRequest,
  readAdvanceRequestConfig,
  readAdvanceRequestSecretFile,
  recordAdvanceRequest,
} from "../../packages/operator/src/advance-request-exchange.ts";
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
  bindAdvanceRequestHost({ ...params(dir, campaignId), operatorUid: UID, hostId, pcId });
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
    expect(bound.value.secret_file).toBe(advanceRequestSecretPath(params(dir), "host-1"));
    expect(statSync(bound.value.secret_file).mode & 0o777).toBe(0o600);
    expect(statSync(advanceRequestDir(params(dir))).mode & 0o777).toBe(0o700);
    // not the read (player-view) binding's directory
    expect(advanceRequestDir(params(dir))).not.toBe(playerViewDir(params(dir)));
    expect(existsSync(playerViewDir(params(dir)))).toBe(false);
    const config = await readAdvanceRequestConfig(params(dir), UID);
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    expect(config.value.format).toBe(ADVANCE_REQUEST_CONFIG_FORMAT);
    expect(config.value.hosts).toEqual([
      { host_id: "host-1", secret_sha256: expect.stringMatching(/^[0-9a-f]{64}$/), pc_id: "pc-1" },
    ]);
    const text = readFileSync(join(advanceRequestDir(params(dir)), "config.json"), "utf8");
    expect(text).not.toContain(secret);
    expect(text).not.toMatch(/role|permission|confirm/);
  });

  it("refuses a duplicate host, a bad identity and a ninth host, and changes nothing when it refuses", async () => {
    const dir = stateDir();
    expect((await bind(dir, "host-1")).ok).toBe(true);
    const before = readFileSync(join(advanceRequestDir(params(dir)), "config.json"), "utf8");
    const duplicate = await bind(dir, "host-1");
    expect(!duplicate.ok && duplicate.error.code).toBe("HOST_EXISTS");
    for (const hostId of ["", "../x", "a b", "-lead", "x".repeat(65)])
      expect((await bind(dir, hostId)).ok, hostId).toBe(false);
    for (const pcId of ["", "-", "../x", "a b"])
      expect((await bind(dir, "h", pcId)).ok, pcId).toBe(false);
    expect(readFileSync(join(advanceRequestDir(params(dir)), "config.json"), "utf8")).toBe(before);
    for (let i = 2; i <= 8; i += 1) expect((await bind(dir, `host-${i}`)).ok).toBe(true);
    const ninth = await bind(dir, "host-9");
    expect(!ninth.ok && ninth.error.code).toBe("CONFIG_INVALID");
    expect(existsSync(advanceRequestSecretPath(params(dir), "host-9"))).toBe(false);
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
    expect(await authorizeAdvanceRequestHost(params(dir), UID, "host-a", secretA)).toEqual({
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
      const r = await authorizeAdvanceRequestHost(params(dir), UID, host, secret);
      expect(r.ok, `${host} ${secret.slice(0, 6)}`).toBe(false);
      expect(!r.ok && r.error.message).toBe("the time-advance-request host is not authorized");
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
      (await authorizeAdvanceRequestHost(params(dir, "campaign-b"), UID, "host-a", secretA)).ok,
    ).toBe(false);
    expect(
      (await authorizeAdvanceRequestHost(params(dir, "campaign-b"), UID, "host-a", secretB)).ok,
    ).toBe(true);
    expect(
      (await authorizeAdvanceRequestHost(params(dir, "campaign-c"), UID, "host-a", secretA)).ok,
    ).toBe(false);
    expect((await authorizeAdvanceRequestHost(params(dir), UID + 1, "host-a", secretA)).ok).toBe(
      false,
    );
  });

  it("a corrupt or foreign configuration is refused, never partly trusted", async () => {
    const dir = stateDir();
    const a = await bind(dir, "host-a");
    if (!a.ok) throw new Error("bind failed");
    const secret = readFileSync(a.value.secret_file, "utf8").trim();
    const config = join(advanceRequestDir(params(dir)), "config.json");
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
        (await authorizeAdvanceRequestHost(params(dir), UID, "host-a", secret)).ok,
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
    expect(readAdvanceRequestSecretFile(make(0o600, `${SECRET}\n`).file)).toBe(SECRET);
    for (const [mode, text] of [
      [0o640, SECRET],
      [0o604, SECRET],
      [0o600, "short"],
      [0o600, SECRET.toUpperCase()],
      [0o600, `${SECRET}\n${"x".repeat(300)}`],
      [0o600, ""],
    ] as const)
      expect(readAdvanceRequestSecretFile(make(mode, text).file), `${mode.toString(8)}`).toBeNull();
  });

  it("never follows a symbolic link and reports an absent file or a directory as unreadable", () => {
    const { dir, file } = make(0o600, SECRET);
    const link = join(dir, "link.secret");
    symlinkSync(file, link);
    expect(readAdvanceRequestSecretFile(link)).toBeNull();
    expect(readAdvanceRequestSecretFile(join(dir, "absent"))).toBeNull();
    mkdirSync(join(dir, "adir"));
    expect(readAdvanceRequestSecretFile(join(dir, "adir"))).toBeNull();
  });
});

describe("the one pending ask", () => {
  it("is recorded once, is idempotent for the same character and basis whoever asks, and carries no choice", async () => {
    const dir = stateDir();
    const first = await recordAdvanceRequest(params(dir), ask("host-1"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = await recordAdvanceRequest(params(dir), ask("host-1"));
    const other = await recordAdvanceRequest(params(dir), ask("host-2"));
    expect(again).toEqual(first);
    expect(other).toEqual(first);
    const held = await readAdvanceRequest(params(dir), UID);
    expect(held.ok && held.value).toMatchObject({ host_id: "host-1", pc_id: "pc-1" });
    const files = readdirSync(advanceRequestDir(params(dir)));
    // the ask is its own file, named by its own identity
    expect(files).toEqual([`request-${first.value.request_id}.json`]);
    const file = join(advanceRequestDir(params(dir)), files[0]!);
    expect(readFileSync(file, "utf8")).not.toMatch(/confirm|verdict|role\.|permission/i);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("an ask for another basis or character is stale and is replaced by the new one", async () => {
    const dir = stateDir();
    const a = await recordAdvanceRequest(params(dir), ask("host-1", "pc-1", 100));
    const b = await recordAdvanceRequest(params(dir), ask("host-1", "pc-1", 150));
    const c = await recordAdvanceRequest(params(dir), ask("host-1", "pc-2", 150));
    if (!a.ok || !b.ok || !c.ok) throw new Error("record failed");
    expect(new Set([a.value.request_id, b.value.request_id, c.value.request_id]).size).toBe(3);
    const held = await readAdvanceRequest(params(dir), UID);
    expect(held.ok && held.value?.request_id).toBe(c.value.request_id);
  });

  it("recorders that do not hold the package lock may leave duplicates of ONE ask; they are one ask, the lowest identity is served, and each is settled by its own name", async () => {
    const dir = stateDir();
    const all = await Promise.all(
      Array.from({ length: 8 }, (_, i) => recordAdvanceRequest(params(dir), ask(`host-${i}`))),
    );
    const ids = all.map((r) => (r.ok ? r.value.request_id : "fail"));
    expect(ids.includes("fail")).toBe(false);
    const listed = await listAdvanceRequests(params(dir), UID);
    if (!listed.ok) throw new Error("list failed");
    // every ask the recorders left is the same character at the same basis, and the listing is in identity order
    expect(new Set(listed.value.asks.map((a) => `${a.pc_id}@${a.basis.value}`))).toEqual(
      new Set(["pc-1@100"]),
    );
    const order = listed.value.asks.map((a) => a.request_id);
    expect(order).toEqual([...order].sort());
    const served = await readAdvanceRequest(params(dir), UID);
    expect(served.ok && served.value?.request_id).toBe(order[0]);
    for (const a of listed.value.asks)
      expect(await discardAdvanceRequest(params(dir), a.request_id, UID)).toBe(true);
    expect(await readAdvanceRequest(params(dir), UID)).toEqual({ ok: true, value: null });
  });

  it("is discarded only by its own identity, and an unrecognised file is never overwritten, removed or served", async () => {
    const dir = stateDir();
    const a = await recordAdvanceRequest(params(dir), ask());
    if (!a.ok) throw new Error("record failed");
    expect(await discardAdvanceRequest(params(dir), "0".repeat(32), UID)).toBe(false);
    expect((await readAdvanceRequest(params(dir), UID)).ok).toBe(true);
    expect(await discardAdvanceRequest(params(dir), a.value.request_id, UID)).toBe(true);
    expect(await readAdvanceRequest(params(dir), UID)).toEqual({ ok: true, value: null });
    // an unrecognised file that carries an ask's name (wrong shape, another operator or campaign, another identity inside) is invalid:
    // it is reported, never served, never overwritten and never removed by a cleanup that names it
    const id = "ab".repeat(16);
    const file = join(advanceRequestDir(params(dir)), `request-${id}.json`);
    const other = JSON.parse(
      JSON.stringify({
        ...ask(),
        format: "immortalis-operator-advance-request",
        format_version: 1,
      }),
    );
    for (const text of [
      "{",
      "[]",
      JSON.stringify({ format: "x" }),
      JSON.stringify({ ...other, request_id: "cd".repeat(16) }), // another identity inside the name of this one
      JSON.stringify({ ...other, request_id: id, campaign_id: "campaign-b" }),
      JSON.stringify({ ...other, request_id: id, operator_uid: UID + 1 }),
    ]) {
      writeFileSync(file, text);
      const listed = await listAdvanceRequests(params(dir), UID);
      expect(listed.ok && listed.value).toEqual({ asks: [], invalid: 1 });
      const r = await readAdvanceRequest(params(dir), UID);
      expect(!r.ok && r.error.code).toBe("REQUEST_INVALID");
      expect(await discardAdvanceRequest(params(dir), id, UID)).toBe(false);
      // it does not stop the lawful host from leaving a real ask, and is itself left exactly as found
      const recorded = await recordAdvanceRequest(params(dir), ask());
      expect(recorded.ok).toBe(true);
      expect(readFileSync(file, "utf8")).toBe(text);
      const mine = await readAdvanceRequest(params(dir), UID);
      expect(mine.ok && mine.value?.request_id).toBe(recorded.ok ? recorded.value.request_id : "");
      if (recorded.ok) await discardAdvanceRequest(params(dir), recorded.value.request_id, UID);
    }
  });

  it("every ask is its own file: a re-asked ask is a new identity, and cleaning up the first never reaches the second", async () => {
    const dir = stateDir();
    const first = await recordAdvanceRequest(params(dir), ask());
    if (!first.ok) throw new Error("record failed");
    expect(await discardAdvanceRequest(params(dir), first.value.request_id, UID)).toBe(true);
    const second = await recordAdvanceRequest(params(dir), ask());
    if (!second.ok) throw new Error("record failed");
    expect(second.value.request_id).not.toBe(first.value.request_id);
    expect(await discardAdvanceRequest(params(dir), first.value.request_id, UID)).toBe(false);
    const held = await readAdvanceRequest(params(dir), UID);
    expect(held.ok && held.value?.request_id).toBe(second.value.request_id);
  });

  it("an ask of another operating-system user or campaign is not this operator's", async () => {
    const dir = stateDir();
    expect((await recordAdvanceRequest(params(dir), ask())).ok).toBe(true);
    const wrongUid = await readAdvanceRequest(params(dir), UID + 1);
    expect(!wrongUid.ok && wrongUid.error.code).toBe("REQUEST_INVALID");
    const wrongCampaign = await readAdvanceRequest(params(dir, "campaign-b"), UID);
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
    const r = await recordAdvanceRequest({ ...params(dir), fs }, ask());
    expect(!r.ok && r.error.code).toBe("IO_FAILED");
    expect(readdirSync(advanceRequestDir(params(dir)))).toEqual([]);
  });
});
