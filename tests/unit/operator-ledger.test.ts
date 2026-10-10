/* eslint-disable @typescript-eslint/no-explicit-any -- tests corrupt raw ledger JSON */
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

const T = { unit: "t", value: 50 };
const tx = (id: string) => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind: "k", ref: `ref-${id}` },
  context: { ...PLAYER_CHOICE_AUTHORITY },
  publication: { basis: "b", secrecy: "s" },
});
const nullAdvanceIntent = (id = "n1", target = T) => ({
  kind: "NULL_ADVANCE" as const,
  intent_id: id,
  target,
  transaction: tx(`tx-${id}`),
});
const nullResumeIntent = (id: string, from: string, target = T) => ({
  kind: "NULL_RESUME" as const,
  intent_id: id,
  held: { from_transaction: from, target },
  transaction: tx(`tx-${id}`),
});

describe("the NULL-PC OOC choices in the retained intents", () => {
  it("retains an advance and the resume that continues it, in order, and survives a reopen intact", async () => {
    const dir = tempDir();
    const l = await must(open(dir));
    await must(l.record(nullAdvanceIntent("n1")));
    await must(l.markCommitted("n1"));
    await must(l.record(nullResumeIntent("n2", "tx-n1")));
    const again = await must(open(dir));
    expect(again.nullPcChoices().map((c) => [c.kind, c.status, c.seq])).toEqual([
      ["NULL_ADVANCE", "COMMITTED", 1],
      ["NULL_RESUME", "CONFIRMED", 2],
    ]);
    // the active-PC accessors never see them
    expect(again.relocation()).toBeUndefined();
    expect(again.advances()).toEqual([]);
  });

  it("refuses a resume that names no earlier retained choice, itself, another target, or a lineage already resumed", async () => {
    const l = await must(open(tempDir()));
    await must(l.record(nullAdvanceIntent("n1")));
    expect((await l.record(nullResumeIntent("r0", "tx-nothing"))).ok).toBe(false);
    expect((await l.record(nullResumeIntent("r1", "tx-r1"))).ok).toBe(false);
    expect((await l.record(nullResumeIntent("r2", "tx-n1", { unit: "t", value: 51 }))).ok).toBe(
      false,
    );
    expect((await l.record(nullResumeIntent("r3", "tx-n1", { unit: "u", value: 50 }))).ok).toBe(
      false,
    );
    await must(l.record(nullResumeIntent("r4", "tx-n1")));
    expect((await l.record(nullResumeIntent("r5", "tx-n1"))).ok).toBe(false);
    // transaction identities are unique across every NULL-PC choice
    expect((await l.record({ ...nullAdvanceIntent("n9"), transaction: tx("tx-n1") })).ok).toBe(
      false,
    );
    // a resume of the resume carries the same target forward
    await must(l.record(nullResumeIntent("r6", "tx-r4")));
    expect(l.nullPcChoices().map((c) => c.intent_id)).toEqual(["n1", "r4", "r6"]);
  });

  it("forgets only an intent with no effect; the lineage check holds after a discard", async () => {
    const l = await must(open(tempDir()));
    await must(l.record(nullAdvanceIntent("n1")));
    await must(l.discard("n1"));
    expect(l.nullPcChoices()).toEqual([]);
    expect((await l.record(nullResumeIntent("r1", "tx-n1"))).ok).toBe(false);
  });

  it("reads an existing active-PC ledger untouched (format 1, no NULL-PC kind) and rewrites it as the same format", async () => {
    const dir = tempDir();
    const old = await must(open(dir));
    await must(old.record(relocation()));
    await must(old.record(advanceIntent()));
    const path = join(dir, ledgerFileName(CAMPAIGN));
    const before = JSON.parse(readFileSync(path, "utf8"));
    expect(before.format_version).toBe(1);
    const reopened = await must(open(dir));
    await must(reopened.markCommitted("r1"));
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.format_version).toBe(1);
    expect(after.intents.map((i: { kind: string }) => i.kind)).toEqual(["RELOCATION", "ADVANCE"]);
    // active-PC and NULL-PC choices can coexist in one campaign's ledger
    await must(reopened.record(nullAdvanceIntent("n1")));
    expect((await must(open(dir))).intents().map((i) => i.kind)).toEqual([
      "RELOCATION",
      "ADVANCE",
      "NULL_ADVANCE",
    ]);
  });

  it("fails closed on a corrupted NULL-PC ledger: unknown field, bad target, broken lineage, duplicate resume", async () => {
    const dir = tempDir();
    const l = await must(open(dir));
    await must(l.record(nullAdvanceIntent("n1")));
    await must(l.record(nullResumeIntent("r1", "tx-n1")));
    const path = join(dir, ledgerFileName(CAMPAIGN));
    const good = JSON.parse(readFileSync(path, "utf8"));
    const corrupt = (edit: (f: any) => void) => {
      const f = structuredClone(good);
      edit(f);
      writeFileSync(path, JSON.stringify(f));
      return open(dir);
    };
    for (const edit of [
      (f: any) => (f.intents[0].extra = 1),
      (f: any) => (f.intents[0].pc_id = "pc"),
      (f: any) => (f.intents[0].target = { unit: "t", value: -1 }),
      (f: any) => (f.intents[0].target = { unit: "t", value: 1.5 }),
      (f: any) => delete f.intents[0].target,
      (f: any) => (f.intents[1].held.from_transaction = "tx-missing"),
      (f: any) => (f.intents[1].held.target = { unit: "t", value: 51 }),
      (f: any) => (f.intents[1].held.extra = 1),
      (f: any) => (f.intents[1].transaction.transaction_id = "tx-n1"),
      (f: any) => (f.intents[1].transaction.context = { role: "role.archivist", permission: "x" }),
      (f: any) =>
        f.intents.push({ ...f.intents[1], seq: 3, intent_id: "r2", transaction: tx("tx-r2") }),
      (f: any) => (f.intents[1].seq = 1),
    ]) {
      const r = await corrupt(edit);
      expect(r.ok, String(edit)).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("LEDGER_MALFORMED");
    }
  });
});

const pcTargetAdvanceIntent = (id = "p1", target = T, pc = "pc") => ({
  kind: "PC_TARGET_ADVANCE" as const,
  intent_id: id,
  pc_id: pc,
  target,
  transaction: tx(`tx-${id}`),
});
const pcTargetResumeIntent = (id: string, from: string, target = T, pc = "pc") => ({
  kind: "PC_TARGET_RESUME" as const,
  intent_id: id,
  pc_id: pc,
  held: { from_transaction: from, target },
  transaction: tx(`tx-${id}`),
});

describe("the ACTIVE-PC target choices in the retained intents", () => {
  it("retains an advance and the resume that continues it, in order, and survives a reopen intact", async () => {
    const dir = tempDir();
    const l = await must(open(dir));
    await must(l.record(pcTargetAdvanceIntent("p1")));
    await must(l.markCommitted("p1"));
    await must(l.record(pcTargetResumeIntent("p2", "tx-p1")));
    const again = await must(open(dir));
    expect(again.pcTargetChoices().map((c) => [c.kind, c.status, c.seq, c.pc_id])).toEqual([
      ["PC_TARGET_ADVANCE", "COMMITTED", 1, "pc"],
      ["PC_TARGET_RESUME", "CONFIRMED", 2, "pc"],
    ]);
    // the other accessors never see them
    expect(again.relocation()).toBeUndefined();
    expect(again.advances()).toEqual([]);
    expect(again.nullPcChoices()).toEqual([]);
  });

  it("refuses a resume that names no earlier retained choice, itself, another target, another character or a lineage already resumed", async () => {
    const l = await must(open(tempDir()));
    await must(l.record(pcTargetAdvanceIntent("p1")));
    expect((await l.record(pcTargetResumeIntent("r0", "tx-nothing"))).ok).toBe(false);
    expect((await l.record(pcTargetResumeIntent("r1", "tx-r1"))).ok).toBe(false);
    expect((await l.record(pcTargetResumeIntent("r2", "tx-p1", { unit: "t", value: 51 }))).ok).toBe(
      false,
    );
    expect((await l.record(pcTargetResumeIntent("r3", "tx-p1", { unit: "u", value: 50 }))).ok).toBe(
      false,
    );
    expect((await l.record(pcTargetResumeIntent("r3b", "tx-p1", T, "pc-other"))).ok).toBe(false);
    await must(l.record(pcTargetResumeIntent("r4", "tx-p1")));
    expect((await l.record(pcTargetResumeIntent("r5", "tx-p1"))).ok).toBe(false);
    // transaction identities are unique across every active-PC target choice
    expect((await l.record({ ...pcTargetAdvanceIntent("p9"), transaction: tx("tx-p1") })).ok).toBe(
      false,
    );
    // a resume of the resume carries the same target forward
    await must(l.record(pcTargetResumeIntent("r6", "tx-r4")));
    expect(l.pcTargetChoices().map((c) => c.intent_id)).toEqual(["p1", "r4", "r6"]);
  });

  it("the NULL-PC and the active-PC families never continue one another and share no transaction identity", async () => {
    const l = await must(open(tempDir()));
    await must(l.record(nullAdvanceIntent("n1")));
    await must(l.record(pcTargetAdvanceIntent("p1")));
    // an active-PC resume of a NULL-PC choice, and the reverse
    expect((await l.record(pcTargetResumeIntent("r1", "tx-n1"))).ok).toBe(false);
    expect((await l.record(nullResumeIntent("r2", "tx-p1"))).ok).toBe(false);
    // one identity across both families
    expect((await l.record({ ...pcTargetAdvanceIntent("p2"), transaction: tx("tx-n1") })).ok).toBe(
      false,
    );
    expect((await l.record({ ...nullAdvanceIntent("n2"), transaction: tx("tx-p1") })).ok).toBe(
      false,
    );
    await must(l.record(pcTargetResumeIntent("r3", "tx-p1")));
    await must(l.record(nullResumeIntent("r4", "tx-n1")));
    expect(l.pcTargetChoices().map((c) => c.intent_id)).toEqual(["p1", "r3"]);
    expect(l.nullPcChoices().map((c) => c.intent_id)).toEqual(["n1", "r4"]);
  });

  it("forgets only an intent with no effect; the lineage check holds after a discard", async () => {
    const l = await must(open(tempDir()));
    await must(l.record(pcTargetAdvanceIntent("p1")));
    await must(l.discard("p1"));
    expect(l.pcTargetChoices()).toEqual([]);
    expect((await l.record(pcTargetResumeIntent("r1", "tx-p1"))).ok).toBe(false);
  });

  it("reads an existing ledger untouched (format 1, no active-PC target kind) and rewrites it as the same format", async () => {
    const dir = tempDir();
    const old = await must(open(dir));
    await must(old.record(relocation()));
    await must(old.record(advanceIntent()));
    await must(old.record(nullAdvanceIntent("n1")));
    const path = join(dir, ledgerFileName(CAMPAIGN));
    expect(JSON.parse(readFileSync(path, "utf8")).format_version).toBe(1);
    const reopened = await must(open(dir));
    await must(reopened.markCommitted("r1"));
    await must(reopened.record(pcTargetAdvanceIntent("p1")));
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.format_version).toBe(1);
    expect(after.intents.map((i: { kind: string }) => i.kind)).toEqual([
      "RELOCATION",
      "ADVANCE",
      "NULL_ADVANCE",
      "PC_TARGET_ADVANCE",
    ]);
  });

  it("fails closed on a corrupted active-PC target ledger: unknown field, missing PC, bad target, broken lineage, duplicate resume", async () => {
    const dir = tempDir();
    const l = await must(open(dir));
    await must(l.record(pcTargetAdvanceIntent("p1")));
    await must(l.record(pcTargetResumeIntent("r1", "tx-p1")));
    const path = join(dir, ledgerFileName(CAMPAIGN));
    const good = JSON.parse(readFileSync(path, "utf8"));
    const corrupt = (edit: (f: any) => void) => {
      const f = structuredClone(good);
      edit(f);
      writeFileSync(path, JSON.stringify(f));
      return open(dir);
    };
    for (const edit of [
      (f: any) => (f.intents[0].extra = 1),
      (f: any) => delete f.intents[0].pc_id,
      (f: any) => (f.intents[1].pc_id = "pc-other"),
      (f: any) => (f.intents[0].target = { unit: "t", value: -1 }),
      (f: any) => (f.intents[0].target = { unit: "t", value: 1.5 }),
      (f: any) => delete f.intents[0].target,
      (f: any) => (f.intents[1].held.from_transaction = "tx-missing"),
      (f: any) => (f.intents[1].held.target = { unit: "t", value: 51 }),
      (f: any) => (f.intents[1].held.extra = 1),
      (f: any) => (f.intents[1].transaction.transaction_id = "tx-p1"),
      (f: any) => (f.intents[1].transaction.context = { role: "role.archivist", permission: "x" }),
      (f: any) =>
        f.intents.push({ ...f.intents[1], seq: 3, intent_id: "r2", transaction: tx("tx-r2") }),
      (f: any) => (f.intents[1].seq = 1),
    ]) {
      const r = await corrupt(edit);
      expect(r.ok, String(edit)).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("LEDGER_MALFORMED");
    }
  });
});
