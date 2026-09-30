// Conformance evidence for the Campaign Continuity Foundation. Each block names its register ID;
// governing lock: spec/f027/spec-lock.json (F-027 v1.0). These rows stay NOT_IMPLEMENTED/BLOCKED in
// the register (see `partial_evidence`): this slice covers only their persistence/continuity aspect.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { BUILD_SPEC_IDENTITY } from "@immortalis/contracts";
import { FILE_PACKAGE_DESCRIPTOR, createFileCampaign, openFileCampaign } from "@immortalis/engine";
import { IN_MEMORY_DESCRIPTOR, TEST_OWNERS, group, write } from "@immortalis/testkit";
import { tempDir } from "../support/tmp.ts";

describe("IA-01 source/version fidelity (persistence aspect)", () => {
  it("the build's spec identity is the one in spec-lock.json, byte for byte", () => {
    const raw = readFileSync("spec/f027/spec-lock.json", "utf8");
    const lock = JSON.parse(raw) as {
      package: { native_pin: string };
      snapshot_files: Record<string, string>;
    };
    expect(BUILD_SPEC_IDENTITY.package_native_pin).toBe(lock.package.native_pin);
    expect(BUILD_SPEC_IDENTITY.snapshot_files).toEqual(lock.snapshot_files);
  });

  it("every save records the governing spec identity and every receipt records the lock hash", async () => {
    const dir = tempDir();
    const c = await createFileCampaign(dir, { campaignId: "c1", owners: TEST_OWNERS });
    if (!c.ok) throw new Error("create");
    expect(c.value.head().spec_identity).toEqual(BUILD_SPEC_IDENTITY);
    const r = await c.value.commit(group("c1", 1, [write("a", 1)]));
    expect(r.ok && r.value.receipt.basis.spec_lock_sha256).toBe(
      BUILD_SPEC_IDENTITY.spec_lock_sha256,
    );
    await c.value.close();
    const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8")) as {
      spec_identity: unknown;
    };
    expect(manifest.spec_identity).toEqual(BUILD_SPEC_IDENTITY);
  });

  it("a newer timestamp or different lock never silently supersedes: mismatch fails (see continuity.test.ts)", async () => {
    const dir = tempDir();
    const foreign = { ...BUILD_SPEC_IDENTITY, package_native_pin: "2099-01-01T00:00:00.000Z" };
    const created = await createFileCampaign(dir, { campaignId: "c1", specIdentity: foreign });
    if (!created.ok) throw new Error("create");
    await created.value.close();
    const r = await openFileCampaign(dir);
    expect(!r.ok && r.error.code).toBe("SPEC_LOCK_MISMATCH");
  });
});

describe("IA-02 no silent semantic invention (persistence aspect)", () => {
  it("no default owner, facet, unit, basis or secrecy exists anywhere in the commit path", async () => {
    const dir = tempDir();
    const c = await createFileCampaign(dir, { campaignId: "c1" });
    if (!c.ok) throw new Error("create");
    const g = group("c1", 1, [write("a", 1)]);
    const incomplete = { ...g, writes: [{ key: "a", value: 1, expected_version: 0 }] };
    const r = await c.value.commit(incomplete);
    expect(!r.ok && r.error.code).toBe("SCHEMA_INVALID");
    const r2 = await c.value.commit(g);
    expect(!r2.ok && r2.error.code).toBe("OWNER_NOT_REGISTERED");
    expect(c.value.listFacts()).toEqual([]);
    await c.value.close();
  });
});

describe("IA-07 managed-provider recovery stays BLOCKED (never inferred from local success)", () => {
  it("no store implementation claims provider acceptance or production status", () => {
    for (const d of [FILE_PACKAGE_DESCRIPTOR, IN_MEMORY_DESCRIPTOR]) {
      expect(d.production).toBe(false);
      expect(d.provider_acceptance).toBe("NONE");
    }
  });
  it("the register still says BLOCKED", () => {
    const rows = (
      parse(readFileSync("spec/f027/acceptance-register.yaml", "utf8")) as {
        rows: { id: string; status: string }[];
      }
    ).rows;
    expect(rows.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
  });
});
