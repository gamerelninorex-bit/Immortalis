import { createHmac } from "node:crypto";
import { mkdir, readFile, rename, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson, fail, ok } from "@immortalis/contracts";
import { nodeFs, PRODUCTION_INITIAL_SETUP_POLICY } from "@immortalis/engine";
import { describe, expect, it, vi } from "vitest";
import {
  ChronologyCaptureStore,
  captureStartingChronology,
  type CaptureRequest,
} from "../../packages/operator/src/chronology-capture.ts";
import { ProtectedStore } from "../../packages/operator/src/protected-store.ts";
import { observeProtectedFs } from "../support/protected-store-fs.ts";
import { must } from "../support/temporal.ts";
import { snapshotDir, tempDir } from "../support/tmp.ts";

const FORMAT = "immortalis-a05-fixture";
const MAC_KEY = Buffer.alloc(32, 17); // Public deterministic test data.
const LEGACY_NAME = "legacy:request-1";
const LEGACY_FILE = "33c62bba1f57174964996e49d6e9fc548dd532ce.json";
const LEGACY_BYTES =
  '{"format":"immortalis-a05-fixture","format_version":1,"name":"legacy:request-1","record":{"status":"retained","deadline":5000},"mac":"4378ea2d7ec291d487aaae2c8f407f5417a52de71cf9e75729af23641a09842a"}';

function rig() {
  const dir = join(tempDir("a05-protected-"), "records");
  const watched = observeProtectedFs();
  const store = new ProtectedStore({ dir, format: FORMAT, macKey: MAC_KEY, fs: watched.fs });
  return { dir, store, ...watched };
}

describe("ProtectedStore A05 listing", () => {
  it("lists genuine first-run absence, an existing empty directory and old authenticated bytes in filename order", async () => {
    const { dir, store } = rig();
    expect(await store.all()).toEqual(ok([]));
    await mkdir(dir);
    expect(await store.all()).toEqual(ok([]));
    expect(await store.create(LEGACY_NAME, { status: "retained", deadline: 5_000 })).toEqual(
      ok(undefined),
    );
    const legacyPath = join(dir, LEGACY_FILE);
    expect(await readFile(legacyPath, "utf8")).toBe(LEGACY_BYTES);
    expect(await store.create("a-first-name", { state: "terminal" })).toEqual(ok(undefined));
    await writeFile(join(dir, "interrupted.json.tmp"), "ignored scratch file");
    const reopened = new ProtectedStore({
      dir,
      format: FORMAT,
      macKey: MAC_KEY,
      fs: { ...nodeFs, list: async (...args) => (await nodeFs.list(...args)).sort().reverse() },
    });
    expect(await reopened.all()).toEqual(
      ok([
        { name: LEGACY_NAME, record: { status: "retained", deadline: 5_000 } },
        { name: "a-first-name", record: { state: "terminal" } },
      ]),
    );
    expect(await reopened.get(LEGACY_NAME)).toEqual(ok({ status: "retained", deadline: 5_000 }));
    expect(await readFile(legacyPath, "utf8")).toBe(LEGACY_BYTES);
  });

  it.each(["EACCES", "EIO"])(
    "reports %s at directory, enumeration and exact-read boundaries",
    async (code) => {
      const { dir, store, fail, restore } = rig();
      await must(store.create(LEGACY_NAME, { status: "retained" }));
      for (const method of ["fileSize", "list", "readFile"] as const) {
        fail(method, code);
        const listed = await store.all();
        expect(listed).toMatchObject({ ok: false, error: { code: "STORE_UNREADABLE" } });
        expect(JSON.stringify(listed)).not.toContain(dir);
        if (method !== "list") {
          const exact = await store.get(LEGACY_NAME);
          expect(exact).toMatchObject({ ok: false, error: { code: "STORE_UNREADABLE" } });
          expect(JSON.stringify(exact)).not.toContain(dir);
        }
      }
      restore();
      expect(await store.get("never-created")).toEqual(ok(null));
      expect(await store.all()).toEqual(
        ok([{ name: LEGACY_NAME, record: { status: "retained" } }]),
      );
    },
  );

  it("refuses a dangling directory link and a directory that disappears after its presence was verified", async () => {
    const { dir } = rig();
    const missing = join(dir, "no-target");
    await symlink(missing, dir);
    const params = { dir, format: FORMAT, macKey: MAC_KEY };
    const reopened = new ProtectedStore(params);
    expect(await reopened.all()).toMatchObject({ ok: false, error: { code: "STORE_UNREADABLE" } });
    await unlink(dir);
    await mkdir(dir);
    const store = new ProtectedStore({
      ...params,
      fs: {
        ...nodeFs,
        list: async (path, options) => {
          await rmdir(path);
          return nodeFs.list(path, options);
        },
      },
    });
    for (let i = 0; i < 2; i++)
      expect(await store.all()).toMatchObject({ ok: false, error: { code: "STORE_UNREADABLE" } });
  });

  it("fails the whole list if a previously enumerated record vanishes", async () => {
    const { dir, store } = rig();
    await must(store.create(LEGACY_NAME, { status: "retained" }));
    await must(store.create("retired", { state: "cancelled" }));
    const reopened = new ProtectedStore({
      dir,
      format: FORMAT,
      macKey: MAC_KEY,
      fs: {
        ...nodeFs,
        readFile: async (path) => {
          if (!path.endsWith(LEGACY_FILE)) await unlink(path);
          return nodeFs.readFile(path);
        },
      },
    });
    expect(await reopened.all()).toMatchObject({ ok: false, error: { code: "STORE_UNREADABLE" } });
  });

  it.each([
    ["malformed JSON", "{"],
    ["non-envelope JSON", "null"],
    ["name mismatch", LEGACY_BYTES.replace(LEGACY_NAME, "another-name")],
    ["format mismatch", LEGACY_BYTES.replace(FORMAT, "another-store")],
    ["wrong version", LEGACY_BYTES.replace('"format_version":1', '"format_version":2')],
    ["invalid MAC encoding", LEGACY_BYTES.replace(/"}$/, 'ff"}')],
    ["wrong MAC", LEGACY_BYTES.replace('"status":"retained"', '"status":"revoked"')],
    ["non-finite JSON number", LEGACY_BYTES.replace("5000", "1e999")],
  ])("reports %s as corrupt on list and exact read", async (_case, bytes) => {
    const { dir, store } = rig();
    await mkdir(dir);
    await writeFile(join(dir, LEGACY_FILE), bytes);
    for (const result of [await store.all(), await store.get(LEGACY_NAME)]) {
      expect(result).toMatchObject({ ok: false, error: { code: "STORE_CORRUPT" } });
      expect(JSON.stringify(result)).not.toContain(dir);
    }
  });

  it("refuses a valid envelope under a different derived filename or MAC key", async () => {
    const { dir, store } = rig();
    await mkdir(dir);
    const legacy = join(dir, LEGACY_FILE);
    const wrongPath = join(dir, `${"a".repeat(40)}.json`);
    await writeFile(legacy, LEGACY_BYTES);
    await rename(legacy, wrongPath);
    expect(await store.all()).toMatchObject({ ok: false, error: { code: "STORE_CORRUPT" } });
    await rename(wrongPath, legacy);
    const foreign = new ProtectedStore({ dir, format: FORMAT, macKey: Buffer.alloc(32, 18) });
    expect(await foreign.all()).toMatchObject({ ok: false, error: { code: "STORE_CORRUPT" } });
  });

  it("refuses a separately signed envelope with an extra field", async () => {
    const { dir, store } = rig();
    await mkdir(dir);
    const envelope = {
      format: FORMAT,
      format_version: 1,
      name: LEGACY_NAME,
      record: { status: "retained", deadline: 5_000 },
      extension: true,
    };
    const mac = createHmac("sha256", MAC_KEY).update(canonicalJson(envelope)).digest("hex");
    await writeFile(join(dir, LEGACY_FILE), JSON.stringify({ ...envelope, mac }));
    expect(await store.all()).toMatchObject({ ok: false, error: { code: "STORE_CORRUPT" } });
  });
});

describe("A05 chronology capture reuse", () => {
  it.each([0, 32])(
    "keeps the original capture after a read interruption and reopen with %i unrelated files",
    async (unrelated) => {
      const dir = tempDir("a05-chronology-");
      const campaignId = "chronology-campaign";
      const req: CaptureRequest = {
        capture_ref: "capture-original",
        document: {
          format: "immortalis-starting-chronology",
          format_version: 1,
          time: { unit: "seconds", value: 424 },
          statement: "First light",
        },
        grade: "ORIGINAL_MESSAGE_VERIFIED",
        source: {
          client: "client-1",
          oauth_grant: "grant-1",
          request_ref: "message-1",
          original_message_hash: "a".repeat(64),
          method_id: "fixture:proof-a05",
          attestation_hash: "b".repeat(64),
        },
      };
      const watched = observeProtectedFs();
      const reopen = () => new ChronologyCaptureStore({ dir, macKey: MAC_KEY, fs: watched.fs });
      const verifier = {
        tier: "T1_DOUBLE" as const,
        verifyOriginalMessage: vi.fn(async () => true),
      };
      const ctx = {
        campaignId,
        store: reopen(),
        verifier,
        policy: { syntheticEvidence: "REQUIRE" } as const,
      };
      const original = await must(captureStartingChronology(ctx, req));
      const foreignDir = join(dir, "unrelated-runner-records");
      const foreign = new ProtectedStore({ dir: foreignDir, format: FORMAT, macKey: MAC_KEY });
      for (let i = 0; i < unrelated; i++) await must(foreign.create(`runner:${i}`, { i }));
      const bytes = snapshotDir(dir);
      verifier.verifyOriginalMessage.mockClear();

      watched.fail("list", "EIO");
      const retry = captureStartingChronology(ctx, req);
      expect(await retry).toMatchObject({ ok: false, error: { code: "STORE_UNREADABLE" } });
      expect(verifier.verifyOriginalMessage).not.toHaveBeenCalled();
      expect(snapshotDir(dir)).toEqual(bytes);
      watched.fail("readFile", "EACCES");
      expect(await ctx.store.read(req.capture_ref)).toMatchObject({
        ok: false,
        error: { code: "STORE_UNREADABLE" },
      });
      watched.restore();

      for (let i = 0; i < 3; i++) {
        watched.calls.length = 0;
        expect(await captureStartingChronology({ ...ctx, store: reopen() }, req)).toEqual(
          ok(original),
        );
        expect(watched.calls).toEqual(["fileSize", "list", "readFile"]);
      }
      expect(verifier.verifyOriginalMessage).not.toHaveBeenCalled();
      expect(snapshotDir(dir)).toEqual(bytes);
      const unreadable = fail("STORE_UNREADABLE", "a protected record cannot be read");
      vi.spyOn(ctx.store, "read").mockResolvedValueOnce(unreadable);
      expect(await captureStartingChronology(ctx, { ...req, grade: "TOOL_CALL_ONLY" })).toEqual(
        unreadable,
      );
      expect(snapshotDir(dir)).toEqual(bytes);
      expect(
        await captureStartingChronology({ ...ctx, policy: PRODUCTION_INITIAL_SETUP_POLICY }, req),
      ).toMatchObject({ ok: false, error: { code: "RESERVED_NAMESPACE" } });
    },
  );
});
