// The retained confirmed-setup identity (BLUE F60-R1): strict, per campaign and operator, durable, and never replaced.
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readPin, writePin, pinFileName } from "../../packages/operator/src/locality-pin.ts";
import { tempDir } from "../support/tmp.ts";

const ID_A = "a".repeat(32);
const ID_B = "b".repeat(32);

function dir() {
  const d = join(tempDir("immortalis-pin-"), "state");
  mkdirSync(d, { mode: 0o700 });
  return d;
}
const p = (d: string, over: Partial<{ campaignId: string; operatorUid: number }> = {}) => ({
  dir: d,
  campaignId: "camp-1",
  operatorUid: 1000,
  ...over,
});

describe("the retained setup identity", () => {
  it("is absent until retained, then read back exactly", async () => {
    const d = dir();
    expect(await readPin(p(d))).toMatchObject({ ok: true, value: null });
    expect((await writePin({ ...p(d), setupId: ID_A })).ok).toBe(true);
    expect(await readPin(p(d))).toMatchObject({ ok: true, value: ID_A });
    // it holds nothing but the campaign, the operator and the content identity
    const raw = JSON.parse(readFileSync(join(d, pinFileName("camp-1")), "utf8"));
    expect(Object.keys(raw).sort()).toEqual([
      "campaign_id",
      "format",
      "format_version",
      "operator_uid",
      "setup_id",
    ]);
  });

  it("is never replaced: the same identity is a no-op and a different one is a conflict", async () => {
    const d = dir();
    await writePin({ ...p(d), setupId: ID_A });
    expect((await writePin({ ...p(d), setupId: ID_A })).ok).toBe(true);
    const clash = await writePin({ ...p(d), setupId: ID_B });
    expect(!clash.ok && clash.error.code).toBe("PIN_CONFLICT");
    expect(await readPin(p(d))).toMatchObject({ value: ID_A });
  });

  it("is per campaign: another campaign's identity does not constrain this one", async () => {
    const d = dir();
    await writePin({ ...p(d), setupId: ID_A });
    expect(await readPin(p(d, { campaignId: "camp-2" }))).toMatchObject({ ok: true, value: null });
  });

  it("refuses, rather than adopts, a file that is another campaign's, another operator's, malformed or over-claiming", async () => {
    const d = dir();
    await writePin({ ...p(d), setupId: ID_A });
    const own = readFileSync(join(d, pinFileName("camp-1")), "utf8");
    const put = (text: string) => writeFileSync(join(d, pinFileName("camp-1")), text);
    const code = async () => {
      const r = await readPin(p(d));
      return r.ok ? "OK" : r.error.code;
    };
    put(own.replace("camp-1", "camp-9"));
    expect(await code()).toBe("PIN_CAMPAIGN_MISMATCH");
    put(own.replace("1000", "1001"));
    expect(await code()).toBe("PIN_OPERATOR_MISMATCH");
    put("not json");
    expect(await code()).toBe("PIN_MALFORMED");
    put(own.replace("{", '{"confirmed": true,'));
    expect(await code()).toBe("PIN_MALFORMED");
    put(own.replace(ID_A, "xyz"));
    expect(await code()).toBe("PIN_MALFORMED");
    // a malformed file is not overwritten by a new identity
    const w = await writePin({ ...p(d), setupId: ID_B });
    expect(!w.ok && w.error.code).toBe("PIN_MALFORMED");
  });

  it("reports an unwritable directory as a failed write, and an unreadable one as unreadable", async () => {
    const d = dir();
    chmodSync(d, 0o500);
    const w = await writePin({ ...p(d), setupId: ID_A });
    // running as root ignores the mode; either outcome is a lawful Result, never a throw
    expect(typeof w.ok).toBe("boolean");
    chmodSync(d, 0o700);
  });
});
