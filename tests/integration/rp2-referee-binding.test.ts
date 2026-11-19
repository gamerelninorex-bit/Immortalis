// A06 mechanism evidence against the real reader and trusted binder on a temporary filesystem.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nodeFs, type FsOps } from "@immortalis/engine";
import { authorizeHost, bindHost, readConfig, refereeDir, secretPath } from "@immortalis/operator";
import { describe, expect, it } from "vitest";
import { tempDir } from "../support/tmp.ts";

const uid = process.getuid!();
const fixture = () => ({
  stateDir: tempDir("immortalis-a06-"),
  campaignId: "a06",
  operatorUid: uid,
});
const operations = [
  "I002_CLASSIFY",
  "IR_NATIVE_COMPATIBILITY",
  "IR_PHYSICAL_PLACEMENT",
  "F014D_DIRECT_PERCEPTION",
  "GM_SCENE_RESOLUTION",
  "PC_COLLECTION_CYCLE",
  "PC_COLLECTION_REACH",
  "PC_COLLECTION_DELEGATE",
] as const;
type Binding = Parameters<typeof bindHost>[0];
const one = [operations[0]];
const six = operations.slice(0, 6);
const seven = operations.slice(0, 7);
const configFile = (p: Binding | ReturnType<typeof fixture>) => join(refereeDir(p), "config.json");
const snapshot = (p: ReturnType<typeof fixture>) => {
  const dir = refereeDir(p);
  return Object.fromEntries(
    readdirSync(dir)
      .sort()
      .map((entry) => {
        const path = join(dir, entry);
        return [entry, { data: readFileSync(path), mode: statSync(path).mode & 0o777 }];
      }),
  );
};

describe("A06 bindHost validates the complete deduplicated candidate", () => {
  it.each([
    { name: "empty", input: [] },
    { name: "seven distinct", input: seven },
    { name: "seven distinct after deduplication", input: [operations[0], ...seven] },
    { name: "unknown operation", input: [...one, "BAD_OPERATION"] },
    { name: "non-array operation input", input: new Set(one) },
    { name: "non-iterable operation input", input: null },
    { name: "malformed array elements", input: [one, 12] },
  ])("refuses $name before a mutation, both fresh and with a retained host", async ({ input }) => {
    const p = fixture();
    const calls: string[] = [];
    const fs: FsOps = {
      ...nodeFs,
      mkdirp: (path) => {
        calls.push("mkdirp");
        return nodeFs.mkdirp(path);
      },
      createExclusive: (path, bytes) => {
        calls.push("createExclusive");
        return nodeFs.createExclusive(path, bytes);
      },
      writeFileDurable: (path, bytes) => {
        calls.push("writeFileDurable");
        return nodeFs.writeFileDurable(path, bytes);
      },
    };
    const reject = () =>
      bindHost({ ...p, fs, hostId: "bad", operations: input as Binding["operations"] });
    expect(await reject()).toMatchObject({ ok: false, error: { code: "CONFIG_INVALID" } });
    expect(readdirSync(p.stateDir)).toEqual([]);
    expect(calls).toEqual([]);

    expect(await bindHost({ ...p, hostId: "retained", operations: one })).toMatchObject({
      ok: true,
    });
    const before = snapshot(p);
    expect(await reject()).toMatchObject({ ok: false, error: { code: "CONFIG_INVALID" } });
    expect(calls).toEqual([]);
    expect(snapshot(p)).toEqual(before);
    const retainedSecret = readFileSync(secretPath(p, "retained"), "utf8").trim();
    expect(await authorizeHost(p, "retained", retainedSecret, operations[0])).toMatchObject({
      ok: true,
    });
    expect(await authorizeHost(p, "retained", retainedSecret, operations[1])).toMatchObject({
      ok: false,
      error: { code: "OPERATION_NOT_ALLOWED" },
    });
  });

  it("accepts one and six distinct operations, retaining deduplication, scopes and private bytes on reopen", async () => {
    const p = fixture();
    for (const [hostId, input, expected] of [
      ["one", one, one],
      ["six", [...six, ...six], six],
    ] as const) {
      const r = await bindHost({ ...p, hostId, operations: input });
      expect(r).toEqual({ ok: true, value: { secret_file: secretPath(p, hostId) } });
      const cfg = await readConfig(p, uid);
      const secret = readFileSync(secretPath(p, hostId), "utf8").trim();
      expect(cfg).toMatchObject({
        ok: true,
        value: { campaign_id: p.campaignId, operator_uid: uid },
      });
      expect(cfg.ok && cfg.value.hosts.at(-1)).toEqual({
        host_id: hostId,
        secret,
        operations: expected,
      });
      expect(statSync(refereeDir(p)).mode & 0o777).toBe(0o700);
      expect(statSync(configFile(p)).mode & 0o777).toBe(0o600);
      expect(statSync(secretPath(p, hostId)).mode & 0o777).toBe(0o600);
      expect(await authorizeHost({ ...p }, hostId, secret, expected.at(-1)!)).toMatchObject({
        ok: true,
      });
      expect(await authorizeHost({ ...p }, hostId, "invalid", operations[7])).toMatchObject({
        ok: false,
        error: { code: "HOST_UNKNOWN" },
      });
      expect(await authorizeHost({ ...p }, hostId, secret, operations[7])).toMatchObject({
        ok: false,
        error: { code: "OPERATION_NOT_ALLOWED" },
      });
    }
    const reopened = await readConfig({ ...p }, uid);
    expect(
      reopened.ok && reopened.value.hosts.map(({ host_id, operations }) => [host_id, operations]),
    ).toEqual([
      ["one", one],
      ["six", six],
    ]);
    const before = snapshot(p);
    expect(await bindHost({ ...p, hostId: "one", operations: six })).toMatchObject({
      ok: false,
      error: { code: "HOST_EXISTS" },
    });
    expect(snapshot(p)).toEqual(before);
  });

  it("refuses an invalid fresh UID or campaign and a foreign or corrupt retained config", async () => {
    const p = fixture();
    const bind = (scope: ReturnType<typeof fixture>, hostId = "new") =>
      bindHost({ ...scope, operations: one, hostId });
    for (const scope of [
      { ...p, operatorUid: -1 },
      { ...p, campaignId: "" },
    ])
      expect(await bind(scope)).toMatchObject({ ok: false, error: { code: "CONFIG_INVALID" } });
    expect(readdirSync(p.stateDir)).toEqual([]);
    expect(await bind(p, "retained")).toMatchObject({ ok: true });
    const bytes = readFileSync(configFile(p), "utf8");
    for (const input of [bytes, bytes.replace('"a06"', '"foreign"'), "corrupt JSON"]) {
      writeFileSync(configFile(p), input);
      const before = snapshot(p);
      expect(await bind({ ...p, operatorUid: input === bytes ? uid + 1 : uid })).toMatchObject({
        ok: false,
        error: { code: "CONFIG_INVALID" },
      });
      expect(snapshot(p)).toEqual(before);
    }
  });

  for (const step of [
    "fileSize",
    "readFile",
    "mkdirp",
    "createExclusive",
    "writeFileDurable",
  ] as const)
    for (const phase of ["before", "after"] as const)
      it(`reports I/O failure ${phase} ${step} and retains the existing host`, async () => {
        const p = fixture();
        expect(await bindHost({ ...p, hostId: "retained", operations: one })).toMatchObject({
          ok: true,
        });
        const before = snapshot(p);
        const fs: FsOps = { ...nodeFs };
        const original = nodeFs[step];
        Object.defineProperty(fs, step, {
          value: async (...args: Parameters<typeof original>) => {
            if (phase === "before") throw new Error("injected filesystem failure");
            await Reflect.apply(original, nodeFs, args);
            throw new Error("injected filesystem failure");
          },
        });
        expect(await bindHost({ ...p, fs, hostId: "new", operations: six })).toMatchObject({
          ok: false,
          error: { code: "IO_FAILED" },
        });
        const committed = step === "writeFileDurable" && phase === "after";
        if (!committed) expect(readFileSync(configFile(p))).toEqual(before["config.json"]?.data);
        expect(existsSync(secretPath(p, "new"))).toBe(
          step === "writeFileDurable" || (step === "createExclusive" && phase === "after"),
        );
        expect(readFileSync(secretPath(p, "retained"))).toEqual(before["retained.secret"]?.data);
        const reopened = await readConfig({ ...p }, uid);
        expect(reopened.ok && reopened.value.hosts.map(({ host_id }) => host_id)).toEqual(
          committed ? ["retained", "new"] : ["retained"],
        );
        const secret = readFileSync(secretPath(p, "retained"), "utf8").trim();
        expect(await authorizeHost(p, "retained", secret, one[0]!)).toMatchObject({ ok: true });
      });
});
