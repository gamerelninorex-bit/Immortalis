// H-03: the trusted referee binding holds at most eight hosts (`ConfigSchema` ... `.max(8)`). `bindHost` used to write a ninth host
// without looking, so the written configuration failed `readConfig` and the eight established hosts stopped working. These tests use
// the REAL filesystem (and, for the ordering claim, an injected FsOps that records every mutation).
import { chmodSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nodeFs, type FsOps } from "@immortalis/engine";
import { describe, expect, it } from "vitest";
import {
  authorizeHost,
  bindHost,
  readConfig,
  refereeDir,
  secretPath,
  type ExchangeParams,
} from "@immortalis/operator";
import { tempDir } from "../support/tmp.ts";

const CAMPAIGN = "campaign-h03";
const UID = process.getuid!();
const ALL = ["I002_CLASSIFY", "IR_NATIVE_COMPATIBILITY", "IR_PHYSICAL_PLACEMENT"] as const;
const OPS = [
  ["I002_CLASSIFY"],
  ["IR_NATIVE_COMPATIBILITY"],
  ["IR_PHYSICAL_PLACEMENT"],
  ["I002_CLASSIFY", "IR_NATIVE_COMPATIBILITY"],
  ["IR_NATIVE_COMPATIBILITY", "IR_PHYSICAL_PLACEMENT"],
  ["I002_CLASSIFY", "IR_PHYSICAL_PLACEMENT"],
  [...ALL],
  ["I002_CLASSIFY"],
] as const;

const hostName = (n: number) => `host-${n}`;
const base = (stateDir: string, fs?: FsOps): ExchangeParams => ({
  stateDir,
  campaignId: CAMPAIGN,
  ...(fs ? { fs } : {}),
});
const bind = (p: ExchangeParams, hostId: string, operations: readonly (typeof ALL)[number][]) =>
  bindHost({ ...p, operatorUid: UID, hostId, operations });

/** every path under the referee directory with its mode and content, so "unchanged" means byte-for-byte */
function tree(dir: string): Record<string, { mode: number; data: string | null }> {
  const out: Record<string, { mode: number; data: string | null }> = {};
  const walk = (d: string) => {
    out[d] = { mode: statSync(d).mode & 0o7777, data: null };
    for (const n of readdirSync(d).sort()) {
      const path = join(d, n);
      if (statSync(path).isDirectory()) walk(path);
      else out[path] = { mode: statSync(path).mode & 0o7777, data: readFileSync(path, "utf8") };
    }
  };
  walk(dir);
  return out;
}

async function fullCampaign() {
  const stateDir = tempDir("immortalis-h03-");
  const p = base(stateDir);
  for (let n = 0; n < 8; n++) {
    const r = await bind(p, hostName(n), OPS[n]!);
    expect(r.ok, `host ${n}`).toBe(true);
  }
  return { stateDir, p };
}

describe("H-03: bindHost refuses a ninth host before it mutates anything", () => {
  it("registers eight distinct hosts; readConfig yields exactly those identities, scopes and secrets; each authorizes its own routes", async () => {
    const { p } = await fullCampaign();
    const cfg = await readConfig(p, UID);
    expect(cfg.ok).toBe(true);
    if (!cfg.ok) return;
    expect(cfg.value.hosts.map((h) => h.host_id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map(hostName));
    for (const [n, h] of cfg.value.hosts.entries()) {
      expect(h.operations).toEqual([...new Set(OPS[n]!)]);
      expect(h.secret).toBe(readFileSync(secretPath(p, h.host_id), "utf8").trim());
      for (const op of ALL) {
        const a = await authorizeHost({ ...p, operatorUid: UID }, h.host_id, h.secret, op);
        expect(a.ok, `${h.host_id} ${op}`).toBe(h.operations.includes(op));
        if (!a.ok) expect(a.error.code).toBe("OPERATION_NOT_ALLOWED");
      }
    }
  });

  it("a ninth distinct host fails with CONFIG_INVALID and changes nothing: config bytes, secrets, modes and directory contents", async () => {
    const { p } = await fullCampaign();
    const dir = refereeDir(p);
    const before = tree(dir);
    const configBefore = readFileSync(join(dir, "config.json"));

    const ninth = await bind(p, "host-8", ["I002_CLASSIFY"]);
    expect(ninth.ok).toBe(false);
    if (!ninth.ok) expect(ninth.error.code).toBe("CONFIG_INVALID");

    expect(readFileSync(join(dir, "config.json")).equals(configBefore)).toBe(true);
    expect(tree(dir)).toEqual(before);
    expect(readdirSync(dir).filter((n) => n.endsWith(".secret"))).toHaveLength(8);
    expect(() => statSync(secretPath(p, "host-8"))).toThrow();
    // the modes the operator set are untouched
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, "config.json")).mode & 0o777).toBe(0o600);
    expect(statSync(secretPath(p, "host-0")).mode & 0o777).toBe(0o600);
  });

  it("after the refusal the binding still reads, the old hosts authenticate with their real secrets and wrong ones are rejected", async () => {
    const { p } = await fullCampaign();
    const before = await readConfig(p, UID);
    await bind(p, "host-8", [...ALL]);
    await bind(p, "host-9", [...ALL]); // a second refused attempt changes nothing either
    const after = await readConfig(p, UID);
    expect(after.ok).toBe(true);
    expect(after).toEqual(before);
    if (!after.ok) return;
    const ap = { ...p, operatorUid: UID };
    for (const [n, h] of after.value.hosts.entries()) {
      const ok = await authorizeHost(ap, h.host_id, h.secret, null);
      expect(ok.ok).toBe(true);
      const wrong = await authorizeHost(ap, h.host_id, "0".repeat(64), null);
      expect(wrong.ok).toBe(false);
      if (!wrong.ok) expect(wrong.error.code).toBe("HOST_UNKNOWN");
      const excluded = ALL.find((op) => !OPS[n]!.includes(op as never));
      if (excluded) {
        const denied = await authorizeHost(ap, h.host_id, h.secret, excluded);
        expect(denied.ok).toBe(false);
        if (!denied.ok) expect(denied.error.code).toBe("OPERATION_NOT_ALLOWED");
      }
    }
    // the refused hosts never became bound
    for (const id of ["host-8", "host-9"]) {
      const a = await authorizeHost(ap, id, "0".repeat(64), null);
      expect(a.ok).toBe(false);
    }
  });

  it("the ninth rejection happens before ANY mutation call of an injected filesystem", async () => {
    const { stateDir } = await fullCampaign();
    const calls: string[] = [];
    const spy: FsOps = {
      ...nodeFs,
      mkdirp: (d) => (calls.push(`mkdirp ${d}`), nodeFs.mkdirp(d)),
      writeFileDurable: (f, d) => (
        calls.push(`writeFileDurable ${f}`),
        nodeFs.writeFileDurable(f, d)
      ),
      appendDurable: (f, d) => (calls.push(`appendDurable ${f}`), nodeFs.appendDurable(f, d)),
      truncate: (f, s) => (calls.push(`truncate ${f}`), nodeFs.truncate(f, s)),
      remove: (f) => (calls.push(`remove ${f}`), nodeFs.remove(f)),
      createExclusive: (f, d) => (calls.push(`createExclusive ${f}`), nodeFs.createExclusive(f, d)),
    };
    const r = await bind(base(stateDir, spy), "host-8", ["I002_CLASSIFY"]);
    expect(r.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("keeps the other refusals: duplicate at capacity, malformed host id, wrong operator or campaign, unreadable config, I/O failure", async () => {
    const { stateDir, p } = await fullCampaign();
    const dir = refereeDir(p);
    const before = tree(dir);

    // a duplicate host id is still HOST_EXISTS, even when the binding is full
    const dup = await bind(p, "host-3", ["I002_CLASSIFY"]);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe("HOST_EXISTS");
    // a malformed host id is still refused as an invalid identity
    for (const bad of ["", "../escape", "-lead", "a b", "x".repeat(65)]) {
      const r = await bind(p, bad, ["I002_CLASSIFY"]);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("CONFIG_INVALID");
    }
    // another operator or campaign cannot bind into this binding
    const otherOperator = await bindHost({
      ...p,
      operatorUid: UID + 1,
      hostId: "host-z",
      operations: ["I002_CLASSIFY"],
    });
    expect(otherOperator.ok).toBe(false);
    if (!otherOperator.ok) expect(otherOperator.error.code).toBe("CONFIG_INVALID");
    expect(tree(dir)).toEqual(before);

    // an invalid existing configuration is refused, not repaired or overwritten
    const cfgPath = join(dir, "config.json");
    writeFileSync(cfgPath, "{ not json");
    chmodSync(cfgPath, 0o600);
    const corrupt = await bind(p, "host-8", ["I002_CLASSIFY"]);
    expect(corrupt.ok).toBe(false);
    if (!corrupt.ok) expect(corrupt.error.code).toBe("CONFIG_INVALID");
    expect(readFileSync(cfgPath, "utf8")).toBe("{ not json");

    // an I/O failure while binding below capacity is still IO_FAILED
    const fresh = tempDir("immortalis-h03-io-");
    const failing: FsOps = {
      ...nodeFs,
      createExclusive: () => Promise.reject(new Error("disk full")),
    };
    const io = await bind(base(fresh, failing), "host-0", ["I002_CLASSIFY"]);
    expect(io.ok).toBe(false);
    if (!io.ok) expect(io.error.code).toBe("IO_FAILED");
    expect(stateDir).not.toBe(fresh);
  });

  it("the eighth host is accepted (the bound is exclusive of nothing but the ninth)", async () => {
    const stateDir = tempDir("immortalis-h03-eighth-");
    const p = base(stateDir);
    for (let n = 0; n < 7; n++)
      expect((await bind(p, hostName(n), ["I002_CLASSIFY"])).ok).toBe(true);
    const eighth = await bind(p, hostName(7), ["I002_CLASSIFY"]);
    expect(eighth.ok).toBe(true);
    const cfg = await readConfig(p, UID);
    expect(cfg.ok && cfg.value.hosts).toHaveLength(8);
  });
});
