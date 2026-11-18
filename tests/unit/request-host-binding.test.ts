import * as fs from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalJson } from "@immortalis/contracts";
import {
  advanceRequestDir,
  authorizeAdvanceRequestHost,
  bindAdvanceRequestHost,
  readAdvanceRequestConfig,
} from "../../packages/operator/src/advance-request-exchange.ts";
import {
  authorizeObserveRequestHost,
  bindObserveRequestHost,
  observeRequestDir,
  readObserveRequestConfig,
} from "../../packages/operator/src/observe-request-exchange.ts";
import { interrupt, type FileCall } from "../support/rp1-filesystem.ts";
import { tempDir } from "../support/tmp.ts";

const faults = vi.hoisted(() => ({}) as Parameters<typeof interrupt>[0]);
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof fs>();
  const { observeFileOps } = await import("../support/rp1-filesystem.ts");
  return observeFileOps(real, faults);
});
afterEach(() => {
  delete faults.before;
  delete faults.after;
  vi.restoreAllMocks();
});

const uid = process.getuid!();
const advance = {
  name: "advance",
  dir: advanceRequestDir,
  bind: bindAdvanceRequestHost,
  authorize: authorizeAdvanceRequestHost,
  read: readAdvanceRequestConfig,
};
const observe = {
  name: "observe",
  dir: observeRequestDir,
  bind: bindObserveRequestHost,
  authorize: authorizeObserveRequestHost,
  read: readObserveRequestConfig,
};
const exchanges = [advance, observe];

function fixture(exchange: (typeof exchanges)[number]) {
  const p = {
    stateDir: tempDir("rp1-a07-"),
    campaignId: "campaign-a",
    operatorUid: uid,
    hostId: "h1",
    pcId: "pc-1",
  };
  const dir = exchange.dir(p);
  return {
    p,
    dir,
    intent: join(dir, ".binding-intent.json"),
    secret: join(dir, "h1.secret"),
    config: join(dir, "config.json"),
  };
}

const secretFromIntent = (path: string) => {
  const { seed, secret_sha256, ...identity } = JSON.parse(fs.readFileSync(path, "utf8"));
  const secret = createHmac("sha256", Buffer.from(seed, "hex"))
    .update(canonicalJson(identity))
    .digest("hex");
  expect(createHash("sha256").update(secret).digest("hex") === secret_sha256).toBe(true);
  return secret;
};

const cuts: readonly [string, (c: FileCall, f: ReturnType<typeof fixture>) => boolean][] = [
  ["mkdir", (c, f) => c.op === "mkdirSync" && c.path === f.dir],
  ["intent data and digest", (c, f) => c.op === "writeFileSync" && c.path.startsWith(f.intent)],
  ["intent mode", (c, f) => c.op === "fchmodSync" && c.path.startsWith(f.intent)],
  ["intent publication", (c, f) => c.op === "linkSync" && c.destination === f.intent],
  ["secret data", (c, f) => c.op === "writeFileSync" && c.path.startsWith(f.secret)],
  ["secret mode", (c, f) => c.op === "fchmodSync" && c.path.startsWith(f.secret)],
  ["secret publication", (c, f) => c.op === "linkSync" && c.destination === f.secret],
  ["config mode", (c, f) => c.op === "fchmodSync" && c.path.startsWith(f.config)],
  ["config data barrier", (c, f) => c.op === "fsyncSync" && c.path.startsWith(f.config)],
  ["config publication", (c, f) => c.op === "renameSync" && c.destination === f.config],
  ["intent retirement", (c, f) => c.op === "unlinkSync" && c.path === f.intent],
  [
    "config directory barrier",
    (c, f) =>
      c.op === "fsyncSync" &&
      c.path === f.dir &&
      fs.existsSync(f.config) &&
      fs.existsSync(f.intent),
  ],
  [
    "retirement directory barrier",
    (c, f) =>
      c.op === "fsyncSync" &&
      c.path === f.dir &&
      fs.existsSync(f.config) &&
      !fs.existsSync(f.intent),
  ],
];

describe.each(exchanges)("$name request-host recovery", (exchange) => {
  for (const [step, cut] of cuts) {
    it.each(["before", "after"] as const)("recovers a failure %s " + step, async (when) => {
      const f = fixture(exchange);
      const fired = interrupt(faults, when, (c) => cut(c, f));
      const first = await exchange.bind(f.p);
      expect(!first.ok && first.error.code).toBe("IO_FAILED");
      expect(fired()).toBe(true);
      const original = fs.existsSync(f.intent)
        ? secretFromIntent(f.intent)
        : fs.existsSync(f.secret)
          ? fs.readFileSync(f.secret, "utf8").trim()
          : undefined;
      const completed = fs.existsSync(f.config) && !fs.existsSync(f.intent);
      const retry = await exchange.bind({ ...f.p });
      if (completed) expect(!retry.ok && retry.error.code).toBe("HOST_EXISTS");
      else expect(retry).toEqual({ ok: true, value: { secret_file: f.secret } });
      const secret = fs.readFileSync(f.secret, "utf8").trim();
      if (original) expect(secret === original).toBe(true);
      const held = await exchange.read(f.p, uid);
      expect(held.ok && held.value.hosts).toEqual([
        {
          host_id: f.p.hostId,
          pc_id: f.p.pcId,
          secret_sha256: createHash("sha256").update(secret).digest("hex"),
        },
      ]);
      expect(await exchange.authorize(f.p, uid, f.p.hostId, secret)).toEqual({
        ok: true,
        value: { pc_id: f.p.pcId },
      });
      expect(fs.readdirSync(f.dir).sort()).toEqual(["config.json", "h1.secret"]);
      expect(fs.statSync(f.dir).mode & 0o777).toBe(0o700);
      for (const path of [f.config, f.secret]) expect(fs.statSync(path).mode & 0o777).toBe(0o600);
      const duplicate = await exchange.bind(f.p);
      expect(!duplicate.ok && duplicate.error.code).toBe("HOST_EXISTS");
    });
  }

  it("refuses other subjects and exchanged intents or credentials during recovery", async () => {
    const f = fixture(exchange);
    interrupt(faults, "after", (c) => c.op === "linkSync" && c.destination === f.secret);
    expect((await exchange.bind(f.p)).ok).toBe(false);
    const intent = fs.readFileSync(f.intent);
    const secret = fs.readFileSync(f.secret);
    for (const change of [{ hostId: "h2" }, { pcId: "pc-2" }, { operatorUid: uid + 1 }])
      expect((await exchange.bind({ ...f.p, ...change })).ok).toBe(false);
    const otherCampaign = { ...f.p, campaignId: "campaign-b" };
    const otherExchange = exchanges.find((x) => x.name !== exchange.name)!;
    for (const [sink, operation] of [
      [exchange, otherCampaign],
      [otherExchange, f.p],
    ] as const) {
      const otherDir = sink.dir(operation);
      fs.mkdirSync(otherDir, { mode: 0o700 });
      fs.writeFileSync(join(otherDir, ".binding-intent.json"), intent, { mode: 0o600 });
      fs.writeFileSync(join(otherDir, "h1.secret"), secret, { mode: 0o600 });
      expect((await sink.bind(operation)).ok).toBe(false);
      fs.rmSync(otherDir, { recursive: true });
    }
    const legitimate = { ...f.p, hostId: "h2" };
    const foreign = await otherExchange.bind(legitimate);
    if (!foreign.ok) throw new Error("cross-exchange control could not bind");
    fs.writeFileSync(f.secret, fs.readFileSync(foreign.value.secret_file));
    expect((await exchange.bind(f.p)).ok).toBe(false);
    fs.writeFileSync(f.secret, secret);
    expect(fs.readFileSync(f.intent).equals(intent)).toBe(true);
    expect((await exchange.bind(f.p)).ok).toBe(true);
    expect(
      (await otherExchange.authorize(legitimate, uid, f.p.hostId, secret.toString().trim())).ok,
    ).toBe(false);
  });

  it.each(["missing", "corrupt", "digest", "symlink", "writable", "foreign owner"] as const)(
    "refuses a %s intent and leaves the otherwise well-formed orphan alone",
    async (problem) => {
      const f = fixture(exchange);
      interrupt(faults, "after", (c) => c.op === "linkSync" && c.destination === f.secret);
      expect((await exchange.bind(f.p)).ok).toBe(false);
      const secret = fs.readFileSync(f.secret);
      if (problem === "missing") fs.unlinkSync(f.intent);
      if (problem === "corrupt") fs.writeFileSync(f.intent, "{");
      if (problem === "digest") {
        const intent = JSON.parse(fs.readFileSync(f.intent, "utf8"));
        fs.writeFileSync(f.intent, JSON.stringify({ ...intent, secret_sha256: "00".repeat(32) }));
      }
      if (problem === "symlink") {
        fs.renameSync(f.intent, f.intent + ".elsewhere");
        fs.symlinkSync(f.intent + ".elsewhere", f.intent);
      }
      if (problem === "writable") fs.chmodSync(f.intent, 0o620);
      if (problem === "foreign owner")
        faults.after = (c, result) => {
          if (c.op === "fstatSync" && c.path === f.intent)
            Object.assign(result as fs.Stats, { uid: uid + 1 });
        };
      expect((await exchange.bind(f.p)).ok).toBe(false);
      expect(fs.readFileSync(f.secret).equals(secret)).toBe(true);
      expect(fs.existsSync(f.config)).toBe(false);
    },
  );

  it("can finish the eighth host after config publication, while refusing overflow", async () => {
    const f = fixture(exchange);
    for (let i = 2; i <= 8; i++)
      expect((await exchange.bind({ ...f.p, hostId: `h${i}` })).ok).toBe(true);
    interrupt(faults, "after", (c) => c.op === "renameSync" && c.destination === f.config);
    expect((await exchange.bind(f.p)).ok).toBe(false);
    expect((await exchange.bind({ ...f.p, hostId: "h9" })).ok).toBe(false);
    expect((await exchange.bind(f.p)).ok).toBe(true);
    expect((await exchange.bind({ ...f.p, hostId: "h9" })).ok).toBe(false);
  });
});
