// Unit evidence for the GM freight binding: a host is bound by the OPERATOR to ONE campaign with its own owner-only secret; no other
// lane's credential opens it, and a wrong host, secret, campaign or operator is one refusal.
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  authorizeGmFreightHost,
  bindGmFreightHost,
  gmFreightDir,
  readGmFreightConfig,
  readGmFreightSecretFile,
} from "../../packages/operator/src/gm-freight-exchange.ts";
import { bindAdvanceRequestHost } from "../../packages/operator/src/advance-request-exchange.ts";

const uid = process.getuid?.() ?? 0;
const freshState = (): string => {
  const d = join(mkdtempSync(join(tmpdir(), "imm-gmx-")), "state");
  return d;
};
const ex = (stateDir: string, campaignId = "cmp-a") => ({ stateDir, campaignId });

describe("binding", () => {
  it("writes an owner-only secret file and a config that holds only the secret's digest", async () => {
    const stateDir = freshState();
    const bound = await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "gm-1" });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const secret = readGmFreightSecretFile(bound.value.secret_file);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    const config = readFileSync(join(gmFreightDir(ex(stateDir)), "config.json"), "utf8");
    expect(config).not.toContain(secret!);
    expect(config).toContain("secret_sha256");
  });

  it("refuses a second binding of the same host, an invalid host identity and a fifth host", async () => {
    const stateDir = freshState();
    expect((await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "h1" })).ok).toBe(
      true,
    );
    const again = await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "h1" });
    expect(again.ok ? "OK" : again.error.code).toBe("HOST_EXISTS");
    const bad = await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "../x" });
    expect(bad.ok ? "OK" : bad.error.code).toBe("CONFIG_INVALID");
    for (const h of ["h2", "h3", "h4"])
      expect((await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: h })).ok).toBe(
        true,
      );
    const fifth = await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "h5" });
    expect(fifth.ok ? "OK" : fifth.error.code).toBe("CONFIG_INVALID");
    // the config the refusal left behind is still readable
    expect((await readGmFreightConfig(ex(stateDir), uid)).ok).toBe(true);
  });
});

describe("authorization", () => {
  it("authorizes only the bound host holding its own secret; every other case is the one refusal", async () => {
    const stateDir = freshState();
    const a = await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "gm-a" });
    const b = await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "gm-b" });
    if (!a.ok || !b.ok) throw new Error("bind");
    const sa = readGmFreightSecretFile(a.value.secret_file)!;
    const sb = readGmFreightSecretFile(b.value.secret_file)!;
    const code = async (host: string, secret: string, id = "cmp-a", u = uid) => {
      const r = await authorizeGmFreightHost(ex(stateDir, id), u, host, secret);
      return r.ok ? "OK" : r.error.code;
    };
    expect(await code("gm-a", sa)).toBe("OK");
    expect(await code("gm-b", sb)).toBe("OK");
    expect(await code("gm-a", sb)).toBe("HOST_UNKNOWN"); // another host's secret
    expect(await code("gm-c", sa)).toBe("HOST_UNKNOWN"); // an unbound host
    expect(await code("gm-a", "0".repeat(64))).toBe("HOST_UNKNOWN");
    expect(await code("gm-a", "not hex")).toBe("HOST_UNKNOWN");
    expect(await code("gm-a", "")).toBe("HOST_UNKNOWN");
    expect(await code("gm-a", sa, "cmp-other")).toBe("NOT_CONFIGURED"); // another campaign has no binding at all
    expect(await code("gm-a", sa, "cmp-a", uid + 1)).toBe("CONFIG_INVALID"); // another operator's reading
  });

  it("the time-advance-request lane's credential opens nothing here, and this one opens nothing there", async () => {
    const stateDir = freshState();
    const gm = await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "same-id" });
    const adv = await bindAdvanceRequestHost({
      ...ex(stateDir),
      operatorUid: uid,
      hostId: "same-id",
      pcId: "pc-1",
    });
    if (!gm.ok || !adv.ok) throw new Error("bind");
    const advSecret = readFileSync(adv.value.secret_file, "utf8").trim();
    const r = await authorizeGmFreightHost(ex(stateDir), uid, "same-id", advSecret);
    expect(r.ok).toBe(false);
    expect(gmFreightDir(ex(stateDir))).not.toBe(adv.value.secret_file.replace(/\/[^/]+$/, ""));
  });
});

describe("the secret file", () => {
  const write = (mode: number, content: string): string => {
    const p = join(mkdtempSync(join(tmpdir(), "imm-gms-")), "s.secret");
    writeFileSync(p, content);
    chmodSync(p, mode);
    return p;
  };
  it("is read only when it is an owner-only regular file holding a well-formed secret", () => {
    const good = "ab".repeat(32);
    expect(readGmFreightSecretFile(write(0o600, `${good}\n`))).toBe(good);
    expect(readGmFreightSecretFile(write(0o640, `${good}\n`))).toBeNull(); // group-readable
    expect(readGmFreightSecretFile(write(0o604, `${good}\n`))).toBeNull(); // other-readable
    expect(readGmFreightSecretFile(write(0o600, "short\n"))).toBeNull();
    expect(readGmFreightSecretFile(write(0o600, `${good}${"0".repeat(400)}`))).toBeNull(); // oversized
    expect(readGmFreightSecretFile("/nonexistent/path.secret")).toBeNull();
  });
});
