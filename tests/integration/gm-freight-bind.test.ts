import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeFs } from "@immortalis/engine";
import { instrumentFs } from "@immortalis/testkit";
import {
  authorizeGmFreightHost,
  bindGmFreightHost,
  gmFreightDir,
  gmFreightSecretPath,
  readGmFreightConfig,
  readGmFreightSecretFile,
} from "../../packages/operator/src/gm-freight-exchange.ts";

/**
 * Enrollment of a GM host (BLUE R-3, R-4). MECHANISM ONLY. The binding is two durable writes that must read as one, serialized across
 * callers: a host exists if and only if the config names it (the commit point), a crash anywhere leaves a state the next bind of that host
 * completes or replaces, and two enrollments of different hosts never lose each other.
 */

const uid = process.getuid?.() ?? 0;
const CAMPAIGN = "cmp-bind";
const fresh = (): string => join(mkdtempSync(join(tmpdir(), "imm-gmb-")), "state");
const ex = (stateDir: string) => ({ stateDir, campaignId: CAMPAIGN });
const dirListing = (stateDir: string): string[] => readdirSync(gmFreightDir(ex(stateDir))).sort();

/** a host is usable when it authorizes with the secret in its own file */
async function usable(stateDir: string, hostId: string): Promise<boolean> {
  const secret = readGmFreightSecretFile(gmFreightSecretPath(ex(stateDir), hostId));
  if (secret === null) return false;
  return (await authorizeGmFreightHost(ex(stateDir), uid, hostId, secret)).ok;
}

describe("R-3: a crash or lost acknowledgement at every durable cut of an enrollment leaves a binding the next bind completes", () => {
  it("fails and succeeds before and after EVERY mutating operation, and always converges on one usable host with no orphan", async () => {
    // how many mutating operations does one clean enrollment take?
    const probeState = fresh();
    const probe = instrumentFs(nodeFs);
    const probed = await bindGmFreightHost({
      ...ex(probeState),
      operatorUid: uid,
      hostId: "h1",
      fs: probe.fs,
    });
    expect(probed.ok).toBe(true);
    const total = probe.count();
    expect(total).toBeGreaterThanOrEqual(4);

    let scenarios = 0;
    let ackLost = 0;
    for (let failAt = 1; failAt <= total; failAt++)
      for (const when of ["before", "after"] as const) {
        const stateDir = fresh();
        const inst = instrumentFs(nodeFs, { failAt, when });
        let first;
        try {
          first = await bindGmFreightHost({
            ...ex(stateDir),
            operatorUid: uid,
            hostId: "h1",
            fs: inst.fs,
          });
        } catch {
          first = undefined; // an exception escaping is a crashed process
        }
        // a dead process's enrollment lock is reclaimed by the operator (and by the next bind once its holder is gone)
        if (existsSync(join(gmFreightDir(ex(stateDir)), "bind.lock")))
          writeFileSync(
            join(gmFreightDir(ex(stateDir)), "bind.lock"),
            JSON.stringify({ pid: 999999, at: 0 }),
          );
        // whatever the faulted call reported, a success it reported is a usable host
        if (first?.ok)
          expect(await usable(stateDir, "h1"), `${failAt}/${when}: ok means usable`).toBe(true);
        else ackLost++;

        // the SAME bind again completes (or recognises) the enrollment, on a healthy filesystem
        const again = await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "h1" });
        expect(again.ok, `${failAt}/${when}: the retry (${JSON.stringify(again)})`).toBe(true);
        expect(await usable(stateDir, "h1"), `${failAt}/${when}: usable`).toBe(true);
        const config = await readGmFreightConfig(ex(stateDir), uid);
        expect(
          config.ok && config.value.hosts.map((h) => h.host_id),
          `${failAt}/${when}: one host`,
        ).toEqual(["h1"]);
        // the secret the retry returned is the one the config names, and a third bind rotates nothing
        const secret = readGmFreightSecretFile(gmFreightSecretPath(ex(stateDir), "h1"));
        const third = await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "h1" });
        expect(third.ok).toBe(true);
        expect(readGmFreightSecretFile(gmFreightSecretPath(ex(stateDir), "h1"))).toBe(secret);
        // no orphan, no lock, no temporary file
        expect(dirListing(stateDir), `${failAt}/${when}: directory`).toEqual([
          "config.json",
          "h1.secret",
        ]);
        scenarios++;
      }
    expect(scenarios).toBe(total * 2);
    expect(ackLost).toBeGreaterThan(0);
  }, 180_000);

  it("an orphan secret file (no config entry) authorizes nothing and is replaced, never trusted", async () => {
    const stateDir = fresh();
    expect(
      (await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "keep" })).ok,
    ).toBe(true);
    const orphanSecret = "cd".repeat(32);
    writeFileSync(gmFreightSecretPath(ex(stateDir), "ghost"), `${orphanSecret}\n`, { mode: 0o600 });
    expect((await authorizeGmFreightHost(ex(stateDir), uid, "ghost", orphanSecret)).ok).toBe(false);
    const bound = await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "ghost" });
    expect(bound.ok).toBe(true);
    expect(readGmFreightSecretFile(gmFreightSecretPath(ex(stateDir), "ghost"))).not.toBe(
      orphanSecret,
    );
    expect((await authorizeGmFreightHost(ex(stateDir), uid, "ghost", orphanSecret)).ok).toBe(false);
    expect(await usable(stateDir, "ghost")).toBe(true);
    expect(await usable(stateDir, "keep")).toBe(true);
  });

  it("a configured host whose secret file is gone or is not its own is reported, never silently re-keyed", async () => {
    const stateDir = fresh();
    const bound = await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "h1" });
    if (!bound.ok) throw new Error("bind");
    writeFileSync(bound.value.secret_file, `${"ef".repeat(32)}\n`, { mode: 0o600 });
    const r = await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "h1" });
    expect(r.ok ? "OK" : r.error.code).toBe("HOST_EXISTS");
    // the secret the operator did not write for this host authorizes nothing
    expect((await authorizeGmFreightHost(ex(stateDir), uid, "h1", "ef".repeat(32))).ok).toBe(false);
  });
});

describe("R-4: concurrent enrollments never lose an acknowledged host", () => {
  it("enrolling several hosts at once in one process keeps every one, up to the cap, and every credential authorizes after", async () => {
    for (let round = 0; round < 8; round++) {
      const stateDir = fresh();
      const hosts = ["a", "b", "c", "d", "e"];
      const results = await Promise.all(
        hosts.map((h) => bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: h })),
      );
      const bound = hosts.filter((_, i) => results[i]!.ok);
      expect(bound, `round ${round}`).toHaveLength(4); // the cap
      const refused = results.filter((r) => !r.ok);
      expect(refused).toHaveLength(1);
      expect(refused[0]!.ok ? "" : refused[0]!.error.code).toBe("CONFIG_INVALID");
      const config = await readGmFreightConfig(ex(stateDir), uid);
      expect(config.ok && config.value.hosts.map((h) => h.host_id).sort()).toEqual(
        [...bound].sort(),
      );
      for (const h of bound) expect(await usable(stateDir, h), `${round}/${h}`).toBe(true);
      // the refused host left nothing behind
      const loser = hosts.find((_, i) => !results[i]!.ok)!;
      expect(existsSync(gmFreightSecretPath(ex(stateDir), loser))).toBe(false);
      expect(dirListing(stateDir)).toEqual(
        [...bound.map((h) => `${h}.secret`), "config.json"].sort(),
      );
    }
  }, 120_000);

  it("the same host enrolled twice at once is one host with one secret", async () => {
    const stateDir = fresh();
    const [x, y] = await Promise.all([
      bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "same" }),
      bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "same" }),
    ]);
    expect(x.ok && y.ok).toBe(true);
    expect(x.ok && y.ok && x.value.secret_file).toBe(y.ok ? y.value.secret_file : "");
    const config = await readGmFreightConfig(ex(stateDir), uid);
    expect(config.ok && config.value.hosts).toHaveLength(1);
    expect(await usable(stateDir, "same")).toBe(true);
  });

  it("separate OPERATING-SYSTEM PROCESSES enrolling different hosts at once both survive", async () => {
    const run = (stateDir: string, host: string): Promise<{ ok: boolean }> =>
      new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            "--experimental-strip-types",
            "--disable-warning=ExperimentalWarning",
            join(process.cwd(), "tests/integration/fixtures/gm-freight-bind-process.ts"),
            stateDir,
            CAMPAIGN,
            host,
          ],
          { stdio: ["ignore", "pipe", "inherit"] },
        );
        let out = "";
        child.stdout.on("data", (d) => (out += String(d)));
        child.on("error", reject);
        child.on("exit", () => resolve(JSON.parse(out.trim().split("\n").pop() ?? "{}")));
      });
    for (let round = 0; round < 3; round++) {
      const stateDir = fresh();
      const hosts = ["p1", "p2", "p3"];
      const results = await Promise.all(hosts.map((h) => run(stateDir, h)));
      expect(
        results.every((r) => r.ok),
        `round ${round}: ${JSON.stringify(results)}`,
      ).toBe(true);
      const config = await readGmFreightConfig(ex(stateDir), uid);
      expect(config.ok && config.value.hosts.map((h) => h.host_id).sort()).toEqual(hosts);
      for (const h of hosts) expect(await usable(stateDir, h), `${round}/${h}`).toBe(true);
    }
  }, 180_000);

  it("a lock whose holder is gone, or that never became readable, is reclaimed; the lock is never left behind", async () => {
    const stateDir = fresh();
    expect(
      (await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "first" })).ok,
    ).toBe(true);
    const lock = join(gmFreightDir(ex(stateDir)), "bind.lock");
    writeFileSync(lock, JSON.stringify({ pid: 999999 })); // a holder that no longer exists
    expect(
      (await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "second" })).ok,
    ).toBe(true);
    expect(existsSync(lock)).toBe(false);
    writeFileSync(lock, ""); // a holder that died between creating the lock and writing it: it stays unreadable
    expect(
      (await bindGmFreightHost({ ...ex(stateDir), operatorUid: uid, hostId: "third" })).ok,
    ).toBe(true);
    expect(existsSync(lock)).toBe(false);
    expect(readFileSync(join(gmFreightDir(ex(stateDir)), "config.json"), "utf8")).toContain(
      "third",
    );
    for (const h of ["first", "second", "third"]) expect(await usable(stateDir, h)).toBe(true);
  });
});
