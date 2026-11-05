/* eslint-disable @typescript-eslint/no-explicit-any -- tests corrupt raw ledger JSON */
// Initial Locality Bootstrap v0.9 — the operator ledger VERSION 2 (companion "Atomic join and write order"): dispatch_ref on COLLECTION
// intents ONLY, at most one COLLECTION per non-null dispatch_ref inside the one atomic record, the version-1 reader/writer unchanged and
// exact, and NO read-either reader (a file of the other version is refused both ways). MECHANISM ONLY.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAYER_CHOICE_AUTHORITY } from "@immortalis/contracts";
import { nodeFs } from "@immortalis/engine";
import {
  IntentLedger,
  LEDGER_FORMAT_VERSION,
  LEDGER_FORMAT_VERSION_2,
  ledgerFileName,
  type LedgerVersion,
} from "@immortalis/operator";
import { tempDir } from "../support/tmp.ts";

const CAMPAIGN = "campaign-v2";
const open = (dir: string, version?: LedgerVersion, uid = 1000) =>
  IntentLedger.open({
    dir,
    campaignId: CAMPAIGN,
    operatorUid: uid,
    ...(version ? { version } : {}),
  });
const must = async <T>(r: Promise<{ ok: boolean; value?: T; error?: unknown }>): Promise<T> => {
  const v = await r;
  if (!v.ok) throw new Error(JSON.stringify(v.error));
  return v.value as T;
};
const fileOf = (dir: string) => join(dir, ledgerFileName(CAMPAIGN));

const collection = (n: number, dispatch?: string | null) => ({
  kind: "COLLECTION" as const,
  intent_id: `operator-intent:u${n}`,
  pc_id: "pc",
  choice: {
    pc_id: "pc",
    act_id: `operator-act-u${n}`,
    source: { world_id: "w", source_key: "s" },
    reserve_id: "r",
    quantity: { amount: 3, unit: "lump" },
    authored_under: { ...PLAYER_CHOICE_AUTHORITY },
  },
  mechanism_id: "m",
  basis_id: "b",
  publication: { cause: `c${n}`, basis: "b", secrecy: "s" },
  ...(dispatch === undefined ? {} : { dispatch_ref: dispatch }),
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

describe("operator ledger version 2: initialisation and version separation", () => {
  it("is initialised durably as an EMPTY version-2 file before any setup command runs, idempotently", async () => {
    const dir = tempDir();
    const l = await must(open(dir, 2));
    expect(l.version).toBe(2);
    await expect(nodeFs.fileSize(fileOf(dir))).resolves.toBeNull(); // nothing is written until it is initialised or used
    await must(l.initializeV2());
    const written = JSON.parse(readFileSync(fileOf(dir), "utf8"));
    expect(written).toMatchObject({
      format: "immortalis-operator-intents",
      format_version: LEDGER_FORMAT_VERSION_2,
      next_seq: 1,
      intents: [],
    });
    await must(l.initializeV2());
    expect(readFileSync(fileOf(dir), "utf8")).toBe(`${JSON.stringify(written, null, 2)}\n`);
  });

  it("initialising never disturbs a ledger that already holds intents", async () => {
    const dir = tempDir();
    const l = await must(open(dir, 2));
    await must(l.record(collection(1, null)));
    const before = readFileSync(fileOf(dir), "utf8");
    await must(l.initializeV2());
    expect(readFileSync(fileOf(dir), "utf8")).toBe(before);
  });

  it("a version-1 reader refuses a version-2 file and a version-2 reader refuses a version-1 file (no read-either, no migration, no downgrade)", async () => {
    const v2 = tempDir();
    await must((await must(open(v2, 2))).initializeV2());
    const asV1 = await open(v2);
    expect(asV1.ok).toBe(false);
    expect((asV1 as any).error.code).toBe("LEDGER_MALFORMED");
    expect((await open(v2, 1)).ok).toBe(false);

    const v1 = tempDir();
    const legacy = await must(open(v1));
    await must(legacy.record(advanceIntent()));
    const asV2 = await open(v1, 2);
    expect(asV2.ok).toBe(false);
    expect((asV2 as any).error.code).toBe("LEDGER_MALFORMED");
    // and the refusal changed nothing
    expect(JSON.parse(readFileSync(fileOf(v1), "utf8")).format_version).toBe(LEDGER_FORMAT_VERSION);
  });

  it("only a version-2 ledger can be initialised that way", async () => {
    const l = await must(open(tempDir()));
    expect(l.version).toBe(1);
    const r = await l.initializeV2();
    expect(r.ok).toBe(false);
  });
});

describe("operator ledger version 2: dispatch_ref is on COLLECTION intents only and unique when non-null", () => {
  it("retains dispatch_ref (null for a direct command) in the SAME record, finds a collection by it, and survives a reopen", async () => {
    const dir = tempDir();
    const l = await must(open(dir, 2));
    await must(l.record(collection(1, null)));
    await must(l.record(collection(2, "dispatch-A")));
    await must(l.markCommitted("operator-intent:u1"));
    await must(l.markCommitted("operator-intent:u2"));
    expect(l.collectionsByDispatchRef("dispatch-A").map((c) => c.intent_id)).toEqual([
      "operator-intent:u2",
    ]);
    expect(l.collectionsByDispatchRef("dispatch-B")).toEqual([]);
    const again = await must(open(dir, 2));
    expect(again.collections().map((c) => [c.intent_id, c.dispatch_ref, c.status])).toEqual([
      ["operator-intent:u1", null, "COMMITTED"],
      ["operator-intent:u2", "dispatch-A", "COMMITTED"],
    ]);
    expect(again.collectionsByDispatchRef("dispatch-A")).toHaveLength(1);
  });

  it("refuses a second COLLECTION under one non-null dispatch_ref atomically, in this process and when the file is read back", async () => {
    const dir = tempDir();
    const l = await must(open(dir, 2));
    await must(l.record(collection(1, "dispatch-A")));
    const dup = await l.record(collection(2, "dispatch-A"));
    expect(dup.ok).toBe(false);
    expect((dup as any).error.code).toBe("LEDGER_CONFLICT");
    expect(l.collections()).toHaveLength(1);
    // two nulls are fine: a direct command carries no dispatch_ref
    await must(l.record(collection(3, null)));
    await must(l.record(collection(4, null)));
    // a concurrent pair resolves to exactly one
    const race = await Promise.all([
      l.record(collection(5, "dispatch-R")),
      l.record(collection(6, "dispatch-R")),
    ]);
    expect(race.filter((r) => r.ok)).toHaveLength(1);
    // a hand-edited file with a duplicated ref is malformed on read
    const raw = JSON.parse(readFileSync(fileOf(dir), "utf8"));
    const first = raw.intents.find((i: any) => i.dispatch_ref === "dispatch-A");
    raw.intents.push({
      ...first,
      seq: raw.next_seq,
      intent_id: "operator-intent:u9",
      choice: { ...first.choice, act_id: "operator-act-u9" },
    });
    raw.next_seq += 1;
    writeFileSync(fileOf(dir), JSON.stringify(raw));
    expect((await open(dir, 2)).ok).toBe(false);
  });

  it("a version-2 ledger requires the field on a COLLECTION intent, and no other kind may carry it", async () => {
    const l = await must(open(tempDir(), 2));
    const missing = await l.record(collection(1));
    expect(missing.ok).toBe(false);
    expect((missing as any).error.code).toBe("LEDGER_MALFORMED");
    const onAdvance = await l.record({ ...advanceIntent(), dispatch_ref: "dispatch-X" } as any);
    expect(onAdvance.ok).toBe(false);
    expect(l.intents()).toEqual([]);
  });

  it("a version-1 ledger accepts NO dispatch_ref anywhere: its writer is exactly what it was", async () => {
    const dir = tempDir();
    const l = await must(open(dir));
    const refused = await l.record(collection(1, "dispatch-A"));
    expect(refused.ok).toBe(false);
    expect((await l.record(collection(1, null))).ok).toBe(false);
    await must(l.record(collection(1)));
    const raw = JSON.parse(readFileSync(fileOf(dir), "utf8"));
    expect(raw.format_version).toBe(1);
    expect("dispatch_ref" in raw.intents[0]).toBe(false);
    expect(l.collectionsByDispatchRef("dispatch-A")).toEqual([]);
  });

  it("a version-1 file with a dispatch_ref injected is malformed (strict), so an injected link is never adopted", async () => {
    const dir = tempDir();
    const l = await must(open(dir));
    await must(l.record(collection(1)));
    const raw = JSON.parse(readFileSync(fileOf(dir), "utf8"));
    raw.intents[0].dispatch_ref = "dispatch-A";
    writeFileSync(fileOf(dir), JSON.stringify(raw));
    expect((await open(dir)).ok).toBe(false);
  });
});
