// F-014B A1-2a (BLUE v6.2 pinned brief, 22 Nov 2026): the trusted GM WAITING ENROLLMENT, unit evidence. T1 MECHANISM ONLY.
// What an enrolled host's secret proves and what it cannot; the digest-only, operation-literal configuration; the owner-only secret file; crash-safe
// idempotent enrollment through the existing request-host binding; and that the enrollment lives in a directory of its own, so no other lane's secret
// opens anything here. An enrollment confers NO role and NO permission and writes no canonical record of any kind.
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GM_WAIT_CONFIG_FORMAT,
  GM_WAIT_OPERATION,
  authorizeGmWaitHost,
  bindGmWaitHost,
  gmWaitDir,
  gmWaitSecretPath,
  readGmWaitConfig,
  readGmWaitSecretFile,
} from "../../packages/operator/src/gm-wait-exchange.ts";
import { observeRequestDir } from "../../packages/operator/src/observe-request-exchange.ts";
import { playerViewDir } from "../../packages/operator/src/player-view-exchange.ts";
import { tempDir } from "../support/tmp.ts";

const UID = process.getuid!();
const stateDir = () => {
  const d = tempDir("immortalis-gm-wait-exchange-");
  chmodSync(d, 0o700);
  return d;
};
const params = (dir: string, campaignId = "campaign-a") => ({ stateDir: dir, campaignId });
const bind = (dir: string, hostId: string, pcId = "pc-1", campaignId = "campaign-a") =>
  bindGmWaitHost({ ...params(dir, campaignId), operatorUid: UID, hostId, pcId });

describe("[A1-2a] [mechanism only] enrolling a GM waiting host", () => {
  it("[A1-2a] [mechanism only] writes an owner-only secret file and a digest-only configuration naming the one operation and the one character, in a directory of its own", async () => {
    const dir = stateDir();
    const bound = await bind(dir, "host-1");
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const secret = readFileSync(bound.value.secret_file, "utf8").trim();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(bound.value.secret_file).toBe(gmWaitSecretPath(params(dir), "host-1"));
    expect(statSync(bound.value.secret_file).mode & 0o777).toBe(0o600);
    expect(statSync(gmWaitDir(params(dir))).mode & 0o777).toBe(0o700);
    // not any other lane's directory
    expect(gmWaitDir(params(dir))).not.toBe(observeRequestDir(params(dir)));
    expect(gmWaitDir(params(dir))).not.toBe(playerViewDir(params(dir)));
    expect(existsSync(observeRequestDir(params(dir)))).toBe(false);
    const config = await readGmWaitConfig(params(dir), UID);
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    expect(config.value.format).toBe(GM_WAIT_CONFIG_FORMAT);
    expect(config.value.operation).toBe(GM_WAIT_OPERATION);
    expect(GM_WAIT_OPERATION).toBe("GM_INTERPRETED_PC_WAIT");
    expect(config.value.hosts).toEqual([
      { host_id: "host-1", secret_sha256: expect.stringMatching(/^[0-9a-f]{64}$/), pc_id: "pc-1" },
    ]);
    const text = readFileSync(join(gmWaitDir(params(dir)), "config.json"), "utf8");
    expect(text).not.toContain(secret);
    // the enrollment states no authority of its own: the role and permission are the trusted code's, per call
    expect(text).not.toMatch(/role|permission|confirm/);
  });

  it("[A1-2a] [mechanism only] never rotates an enrolled host's credential: a second enrollment of it, under any character, a bad identity and a fifth host are refused without changing anything", async () => {
    const dir = stateDir();
    const first = await bind(dir, "host-1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const secret = readFileSync(first.value.secret_file, "utf8");
    const before = readFileSync(join(gmWaitDir(params(dir)), "config.json"), "utf8");
    for (const pc of ["pc-1", "pc-2"]) {
      const again = await bind(dir, "host-1", pc);
      expect(again.ok, pc).toBe(false);
      if (!again.ok) expect(again.error.code).toBe("HOST_EXISTS");
      expect(readFileSync(first.value.secret_file, "utf8")).toBe(secret);
      expect(readFileSync(join(gmWaitDir(params(dir)), "config.json"), "utf8")).toBe(before);
    }
    for (const [host, pc] of [
      ["bad host", "pc-1"],
      ["-x", "pc-1"],
      ["host-2", "bad pc"],
      ["host-2", ""],
    ] as const) {
      const r = await bind(dir, host, pc);
      expect(r.ok, `${host}/${pc}`).toBe(false);
    }
    for (const h of ["host-2", "host-3", "host-4"]) expect((await bind(dir, h)).ok).toBe(true);
    const fifth = await bind(dir, "host-5");
    expect(fifth.ok).toBe(false);
    expect(existsSync(gmWaitSecretPath(params(dir), "host-5"))).toBe(false);
    const hosts = await readGmWaitConfig(params(dir), UID);
    expect(hosts.ok && hosts.value.hosts.map((h) => h.host_id)).toEqual([
      "host-1",
      "host-2",
      "host-3",
      "host-4",
    ]);
  });
});

describe("[A1-2a] [mechanism only] what an enrolled host's secret proves", () => {
  it("[A1-2a] [mechanism only] authorizes only the enrolled host with its own secret, names the character and the one operation, and every other presentation is one refusal", async () => {
    const dir = stateDir();
    const a = await bind(dir, "host-a", "pc-a");
    const b = await bind(dir, "host-b", "pc-b");
    if (!a.ok || !b.ok) throw new Error("setup");
    const secretA = readGmWaitSecretFile(a.value.secret_file)!;
    const secretB = readGmWaitSecretFile(b.value.secret_file)!;
    const good = await authorizeGmWaitHost(params(dir), UID, "host-a", secretA);
    expect(good).toEqual({ ok: true, value: { pc_id: "pc-a", operation: GM_WAIT_OPERATION } });
    const refusals = [
      await authorizeGmWaitHost(params(dir), UID, "host-a", secretB), // another host's secret
      await authorizeGmWaitHost(params(dir), UID, "host-b", secretA),
      await authorizeGmWaitHost(params(dir), UID, "host-c", secretA), // an unknown host
      await authorizeGmWaitHost(params(dir), UID, "host-a", ""),
      await authorizeGmWaitHost(params(dir), UID, "host-a", "not-hex"),
      await authorizeGmWaitHost(params(dir), UID, "host-a", secretA.toUpperCase()),
      await authorizeGmWaitHost(params(dir, "campaign-other"), UID, "host-a", secretA), // another campaign
      await authorizeGmWaitHost(params(dir), UID + 1, "host-a", secretA), // another operator
    ];
    for (const r of refusals) expect(r.ok).toBe(false);
    const codes = refusals.map((r) => (r.ok ? "" : r.error.code));
    expect(codes.slice(0, 6)).toEqual(Array(6).fill("HOST_UNKNOWN"));
    expect(codes[6]).toBe("NOT_CONFIGURED");
    expect(codes[7]).toBe("CONFIG_INVALID");
  });

  it("[A1-2a] [mechanism only] an unreadable, foreign, group-readable, linked or oversized secret file is no secret", async () => {
    const dir = stateDir();
    const bound = await bind(dir, "host-1");
    if (!bound.ok) throw new Error("setup");
    const path = bound.value.secret_file;
    expect(readGmWaitSecretFile(path)).toMatch(/^[0-9a-f]{64}$/);
    chmodSync(path, 0o640);
    expect(readGmWaitSecretFile(path)).toBeNull();
    chmodSync(path, 0o600);
    expect(readGmWaitSecretFile(join(gmWaitDir(params(dir)), "absent.secret"))).toBeNull();
    const link = join(gmWaitDir(params(dir)), "linked.secret");
    symlinkSync(path, link);
    expect(readGmWaitSecretFile(link)).toBeNull();
    const dirAsFile = join(gmWaitDir(params(dir)), "dir.secret");
    mkdirSync(dirAsFile);
    expect(readGmWaitSecretFile(dirAsFile)).toBeNull();
  });
});
