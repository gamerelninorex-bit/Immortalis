// IM-17 contract suite: the same behavior must hold for every CampaignStore implementation.
// Register lineage: IA-03, IA-06 (partial), IA-02; RC-02/RC-07/RC-16; spec lock f027 (spec/f027/spec-lock.json).
import { describe, expect, it } from "vitest";
import { createFileCampaign, type CampaignStore } from "@immortalis/engine";
import {
  TEST_OTHER_OWNER,
  TEST_OWNERS,
  createInMemoryCampaign,
  group,
  write,
} from "@immortalis/testkit";
import { tempDir } from "../support/tmp.ts";

const factories: Record<string, (id: string) => Promise<CampaignStore>> = {
  "in-memory test double": async (id) =>
    createInMemoryCampaign({ campaignId: id, owners: TEST_OWNERS }),
  "prototype file package": async (id) => {
    const r = await createFileCampaign(tempDir(), { campaignId: id, owners: TEST_OWNERS });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r.value;
  },
};

describe.each(Object.entries(factories))("CampaignStore contract — %s", (_name, make) => {
  const errCode = async (store: CampaignStore, g: unknown) => {
    const r = await store.commit(g);
    return r.ok ? "OK" : r.error.code;
  };

  it("never claims production or provider acceptance", async () => {
    const s = await make("c1");
    expect(s.descriptor.production).toBe(false);
    expect(s.descriptor.provider_acceptance).toBe("NONE");
    await s.close();
  });

  it("commits, versions facts and advances revision", async () => {
    const s = await make("c1");
    const r = await s.commit(group("c1", 1, [write("a", 1)]));
    expect(r.ok && r.value.replayed).toBe(false);
    expect(s.getFact("a")).toMatchObject({ version: 1, value: 1 });
    const r2 = await s.commit(group("c1", 2, [write("a", 2, { expected_version: 1 })]));
    expect(r2.ok).toBe(true);
    expect(s.getFact("a")).toMatchObject({ version: 2, value: 2 });
    expect(s.head().revision).toBe(2);
    await s.close();
  });

  it("replays an identical committed intent without changing anything (RC-16)", async () => {
    const s = await make("c1");
    const g = group("c1", 1, [write("a", 1)]);
    const first = await s.commit(g);
    const before = s.head();
    const again = await s.commit(structuredClone(g));
    expect(first.ok && again.ok).toBe(true);
    if (first.ok && again.ok) {
      expect(again.value.replayed).toBe(true);
      expect(again.value.receipt).toEqual(first.value.receipt);
    }
    expect(s.head()).toEqual(before);
    expect(s.lookupReceipt("intent-1")).toEqual(first.ok ? first.value.receipt : null);
    expect(s.lookupReceipt("intent-unknown")).toBeNull();
    await s.close();
  });

  it("rejects the same intent with different content (CAL-07) and a reused group id", async () => {
    const s = await make("c1");
    await s.commit(group("c1", 1, [write("a", 1)]));
    expect(await errCode(s, group("c1", 1, [write("a", 999)]))).toBe("INTENT_CONFLICT");
    expect(await errCode(s, group("c1", 2, [write("z", 1)], { group_id: "group-1" }))).toBe(
      "GROUP_ID_CONFLICT",
    );
    expect(s.getFact("a")).toMatchObject({ value: 1, version: 1 });
    await s.close();
  });

  it("fails closed with typed reasons and leaves state untouched", async () => {
    const s = await make("c1");
    await s.commit(group("c1", 1, [write("a", 1)]));
    const head = s.head();
    const cases: [string, unknown][] = [
      ["CAMPAIGN_MISMATCH", group("other", 2, [write("z", 1)])],
      [
        "AUTHORITY_DENIED",
        group("c1", 3, [write("z", 1)], {
          authority: { role: "role.adviser", permission: "permission.canon.write" },
        }),
      ],
      [
        "AUTHORITY_DENIED",
        group("c1", 4, [write("z", 1)], {
          authority: { role: "role.archivist", permission: "permission.report.render" },
        }),
      ],
      [
        "OWNER_NOT_REGISTERED",
        group("c1", 5, [write("z", 1, { owner: "UNREGISTERED" })], { owner: "UNREGISTERED" }),
      ],
      [
        "OWNER_NOT_REGISTERED",
        group("c1", 6, [write("z", 1, { facet: "nope" })], { facet: "nope" }),
      ],
      ["WRITE_OWNER_MISMATCH", group("c1", 7, [write("z", 1, { owner: TEST_OTHER_OWNER })])],
      ["DUPLICATE_KEY_IN_GROUP", group("c1", 8, [write("z", 1), write("z", 2)])],
      [
        "FACT_OWNER_CONFLICT",
        group("c1", 9, [write("a", 5, { owner: TEST_OTHER_OWNER, expected_version: 1 })], {
          owner: TEST_OTHER_OWNER,
        }),
      ],
      ["VERSION_CONFLICT", group("c1", 10, [write("a", 5, { expected_version: 0 })])],
      ["VERSION_CONFLICT", group("c1", 11, [write("a", 5, { expected_version: 7 })])],
      ["VERSION_CONFLICT", group("c1", 12, [write("new", 5, { expected_version: 1 })])],
      ["STALE_READ", group("c1", 13, [write("z", 1)], { reads: [{ key: "a", version: 0 }] })],
      ["MISSING_DEPENDENCY", group("c1", 14, [write("z", 1)], { depends_on: ["group-never"] })],
      ["SCHEMA_INVALID", { not: "a group" }],
      ["SCHEMA_INVALID", group("c1", 15, [write("z", Number.NaN)])],
    ];
    for (const [code, g] of cases) expect(await errCode(s, g)).toBe(code);
    expect(s.head()).toEqual(head);
    expect(s.listFacts().map((f) => f.key)).toEqual(["a"]);
    await s.close();
  });

  it("a group is all-or-nothing: one bad write rejects the whole group", async () => {
    const s = await make("c1");
    await s.commit(group("c1", 1, [write("a", 1)]));
    const r = await errCode(
      s,
      group("c1", 2, [write("ok-key", 1), write("a", 9, { expected_version: 5 })]),
    );
    expect(r).toBe("VERSION_CONFLICT");
    expect(s.getFact("ok-key")).toBeUndefined();
    await s.close();
  });

  it("honors dependencies and reads that are satisfied", async () => {
    const s = await make("c1");
    await s.commit(group("c1", 1, [write("a", 1)]));
    const r = await s.commit(
      group("c1", 2, [write("b", 2)], {
        depends_on: ["group-1"],
        reads: [{ key: "a", version: 1 }],
      }),
    );
    expect(r.ok).toBe(true);
    await s.close();
  });

  it("disjoint concurrent groups both commit; conflicting ones cannot both win", async () => {
    const s = await make("c1");
    const disjoint = await Promise.all([
      s.commit(group("c1", 1, [write("x", 1)])),
      s.commit(group("c1", 2, [write("y", 1)])),
    ]);
    expect(disjoint.every((r) => r.ok)).toBe(true);
    const racing = await Promise.all([
      s.commit(group("c1", 3, [write("x", "p", { expected_version: 1 })])),
      s.commit(group("c1", 4, [write("x", "q", { expected_version: 1 })])),
    ]);
    expect(racing.filter((r) => r.ok)).toHaveLength(1);
    expect(s.getFact("x")?.version).toBe(2);
    await s.close();
  });

  it("an empty owner registry makes every write fail closed (IA-02/IA-03: no fallback owner)", async () => {
    const s =
      _name === "in-memory test double"
        ? createInMemoryCampaign({ campaignId: "c1", owners: new Map() })
        : await (async () => {
            const r = await createFileCampaign(tempDir(), { campaignId: "c1" });
            if (!r.ok) throw new Error("create failed");
            return r.value;
          })();
    expect(await errCode(s, group("c1", 1, [write("a", 1)]))).toBe("OWNER_NOT_REGISTERED");
    await s.close();
  });
});
