import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAYER_CHOICE_AUTHORITY } from "@immortalis/contracts";
import { nodeFs, type FsOps } from "@immortalis/engine";
import { IntentLedger, ledgerFileName } from "@immortalis/operator";
import { tempDir } from "../support/tmp.ts";

const CAMPAIGN = "campaign-x";
const open = (dir: string, fs?: FsOps, campaignId = CAMPAIGN, uid = 1000) =>
  IntentLedger.open({ dir, campaignId, operatorUid: uid, ...(fs ? { fs } : {}) });
const must = async <T>(r: Promise<{ ok: boolean; value?: T; error?: unknown }>): Promise<T> => {
  const v = await r;
  if (!v.ok) throw new Error(JSON.stringify(v.error));
  return v.value as T;
};

const relocation = (id = "r1") => ({
  kind: "RELOCATION" as const,
  intent_id: id,
  pc_id: "pc",
  choice: {
    pc_id: "pc",
    destination: { world_id: "w", locus_id: "l" },
    authored_under: { ...PLAYER_CHOICE_AUTHORITY },
  },
  delivery_at: { unit: "t", value: 5 },
  publication: { cause: "c", basis: "b", secrecy: "s" },
});
const advanceIntent = (id = "a1") => ({
  kind: "ADVANCE" as const,
  intent_id: id,
  pc_id: "pc",
  transaction: {
    transaction_id: `tx-${id}`,
    cause: "c",
    trigger: { kind: "k", ref: `ref-${id}` },
    context: { ...PLAYER_CHOICE_AUTHORITY },
    publication: { basis: "b", secrecy: "s" },
  },
});

describe("the trusted side's retained confirmed intents", () => {
  it("starts empty, writes nothing until an intent exists, and survives a reopen intact", async () => {
    const dir = tempDir();
    const l = await must(open(dir));
    expect(l.intents()).toEqual([]);
    await expect(nodeFs.fileSize(join(dir, ledgerFileName(CAMPAIGN)))).resolves.toBeNull();
    await must(l.record(relocation()));
    await must(l.record(advanceIntent()));
    await must(l.markCommitted("r1"));
    const again = await must(open(dir));
    expect(again.intents().map((i) => [i.kind, i.status, i.seq])).toEqual([
      ["RELOCATION", "COMMITTED", 1],
      ["ADVANCE", "CONFIRMED", 2],
    ]);
    expect(again.relocation()?.choice.destination).toEqual({ world_id: "w", locus_id: "l" });
    expect(again.advances()).toHaveLength(1);
  });

  it("keeps identities unique, allows one relocation per campaign, and replaces it in a single write", async () => {
    const l = await must(open(tempDir()));
    await must(l.record(relocation("r1")));
    expect((await l.record(relocation("r1"))).ok).toBe(false);
    expect((await l.record(relocation("r2"))).ok).toBe(false);
    expect((await l.replaceRelocation("nope", relocation("r3"))).ok).toBe(false);
    expect((await l.replaceRelocation("r1", relocation("r1"))).ok).toBe(false);
    const replaced = await must(l.replaceRelocation("r1", relocation("r3")));
    expect(replaced).toMatchObject({ intent_id: "r3", status: "CONFIRMED", seq: 2 });
    expect(l.intents().map((i) => i.intent_id)).toEqual(["r3"]);
    await must(l.discard("r3"));
    expect(l.intents()).toEqual([]);
  });

  it("rejects intents that are not exactly the schema: extra fields, wrong authority, malformed identities", async () => {
    const l = await must(open(tempDir()));
    const bad: unknown[] = [
      { ...relocation(), confirmed: true },
      {
        ...relocation(),
        choice: { ...relocation().choice, authored_under: { role: "x", permission: "y" } },
      },
      { ...relocation(), intent_id: "" },
      { ...relocation(), delivery_at: { unit: "t", value: -1 } },
      {
        ...advanceIntent(),
        transaction: { ...advanceIntent().transaction, context: { role: "r", permission: "p" } },
      },
      { ...advanceIntent(), kind: "OTHER" },
    ];
    for (const intent of bad) expect((await l.record(intent as never)).ok).toBe(false);
    expect(l.intents()).toEqual([]);
  });

  it("never believes a write that failed: the in-memory copy follows only what was durably written", async () => {
    const dir = tempDir();
    const failing: FsOps = {
      ...nodeFs,
      writeFileDurable: async () => {
        throw new Error("disk");
      },
    };
    const l = await must(open(dir, failing));
    const r = await l.record(relocation());
    expect(r).toMatchObject({ ok: false, error: { code: "LEDGER_WRITE_FAILED" } });
    expect(l.intents()).toEqual([]);
  });

  it("refuses a file of another campaign or operator, an unknown format, a duplicate sequence and non-JSON, and adopts none of them", async () => {
    const dir = tempDir();
    const l = await must(open(dir));
    await must(l.record(relocation()));
    await must(l.record(advanceIntent()));
    const file = join(dir, ledgerFileName(CAMPAIGN));
    const good = JSON.parse(readFileSync(file, "utf8"));
    const attempts: [unknown, string][] = [
      [{ ...good, campaign_id: "other" }, "LEDGER_CAMPAIGN_MISMATCH"],
      [{ ...good, operator_uid: 1 }, "LEDGER_OPERATOR_MISMATCH"],
      [{ ...good, format: "other" }, "LEDGER_MALFORMED"],
      [{ ...good, format_version: 2 }, "LEDGER_MALFORMED"],
      [{ ...good, extra: 1 }, "LEDGER_MALFORMED"],
      [{ ...good, intents: [good.intents[0], { ...good.intents[1], seq: 1 }] }, "LEDGER_MALFORMED"],
      [{ ...good, intents: [good.intents[0], { ...good.intents[1], seq: 9 }] }, "LEDGER_MALFORMED"],
      [{ ...good, intents: [good.intents[0], good.intents[0]] }, "LEDGER_MALFORMED"],
      ["{", "LEDGER_MALFORMED"],
    ];
    for (const [content, code] of attempts) {
      writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
      expect(await open(dir)).toMatchObject({ ok: false, error: { code } });
    }
  });
});
