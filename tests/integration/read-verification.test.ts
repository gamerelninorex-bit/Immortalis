/* eslint-disable @typescript-eslint/no-explicit-any -- deliberate same-head corruption and expired-handle probes */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { fixtureWorld, publication } from "@immortalis/testkit";
import * as integrity from "../../packages/engine/src/world/integrity.ts";
import { msHarness } from "../support/ms-setup.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

async function fixture(count = 1) {
  const dir = mkdtempSync(join(tmpdir(), "immortalis-read-verification-"));
  dirs.push(dir);
  const created = await CanonicalCampaign.create(dir, { campaignId: "read-verification" });
  if (!created.ok) throw new Error(JSON.stringify(created));
  try {
    for (let i = 0; i < count; i++)
      expect(
        (
          await created.value.establishWorld({
            ...publication(i),
            world: fixtureWorld({ world_id: `world-${i}` }),
          })
        ).ok,
      ).toBe(true);
  } finally {
    await created.value.close();
  }
  return dir;
}
async function open(dir: string, options = {}) {
  const r = await CanonicalCampaign.open(dir, { captureReadVerification: true, ...options });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.value;
}

describe("actual open verification, bounded reuse and strict fallback", () => {
  it("runs the actual complete verifier once and re-authenticates its inputs on every use", async () => {
    const dir = await fixture();
    const spy = vi.spyOn(integrity, "verifyCanonicalIntegrity");
    const c = await open(dir);
    try {
      expect(spy).toHaveBeenCalledTimes(1);
      await c.withReadVerification(async (verify) => {
        expect(verify()).toEqual([]);
        await Promise.resolve();
        expect(verify()).toEqual([]);
        expect(spy).toHaveBeenCalledTimes(1);
      });
      await c.withReadVerification(async (verify) => {
        expect(verify()).toEqual([]);
      });
      expect(spy).toHaveBeenCalledTimes(2); // a second read cannot inherit the first scope
    } finally {
      spy.mockRestore();
      await c.close();
    }
  });

  it("does not trust an unchanged head after an in-memory fact mutation, and never revives a failed proof", async () => {
    const c = await open(await fixture());
    const spy = vi.spyOn(c, "verify");
    try {
      await c.withReadVerification(async (verify) => {
        const fact = c.store.getFact("world/world-0/profile") as any;
        const before = c.store.head();
        const owner = fact.owner;
        fact.owner = "not-the-owner";
        expect(c.store.head()).toEqual(before);
        expect(verify().length).toBeGreaterThan(0);
        expect(spy).toHaveBeenCalledTimes(1);
        fact.owner = owner;
        expect(verify()).toEqual([]);
        expect(spy).toHaveBeenCalledTimes(2); // strict, even after the bytes were restored
      });
    } finally {
      await c.close();
    }
  });

  it("invalidates on an actual owner commit, including a newly admitted previously absent fact", async () => {
    const c = await open(await fixture());
    const spy = vi.spyOn(c, "verify");
    try {
      await c.withReadVerification(async (verify) => {
        expect(verify()).toEqual([]);
        expect(
          (
            await c.establishWorld({
              ...publication(99),
              world: fixtureWorld({ world_id: "later" }),
            })
          ).ok,
        ).toBe(true);
        expect(verify()).toEqual([]);
        expect(spy).toHaveBeenCalledTimes(1);
      });
    } finally {
      await c.close();
    }
  });

  it("expires a retained function on callback return, exception and close; another store cannot supply its basis", async () => {
    const dir = await fixture();
    const c = await open(dir);
    let saved!: () => readonly unknown[];
    try {
      await expect(
        c.withReadVerification(async (verify) => {
          saved = verify;
          expect(verify()).toEqual([]);
          throw new Error("interrupted read");
        }),
      ).rejects.toThrow("interrupted read");
      expect(() => saved()).toThrow("scope is closed");
      const next = vi.spyOn(c, "verify");
      await c.withReadVerification(async (verify) => {
        expect(verify()).toEqual([]);
      });
      expect(next).toHaveBeenCalledTimes(1);
      await c.close();
      await expect(c.withReadVerification(async (verify) => verify())).rejects.toThrow(
        "scope is closed",
      );
      const reopened = await open(dir);
      try {
        expect(() => saved.call(reopened)).toThrow("scope is closed");
        await expect(
          CanonicalCampaign.prototype.withReadVerification.call(
            { store: reopened.store },
            async (v: any) => v(),
          ),
        ).rejects.toThrow();
      } finally {
        await reopened.close();
      }
    } finally {
      await c.close();
    }
  });

  for (const options of [
    { captureReadVerification: false },
    { audit: true },
    { extension: { owners: new Map() } },
  ])
    it(`keeps the full verifier for the non-reuse path ${Object.keys(options).join()}`, async () => {
      const c = await open(await fixture(), options);
      const spy = vi.spyOn(c, "verify");
      try {
        await c.withReadVerification(async (verify) => {
          expect(verify()).toEqual([]);
        });
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        await c.close();
      }
    });
});

describe("fresh backing evidence, after a successful reused verification", () => {
  it("reuses the actual M-S owner chain and its addressed rule-checked evidence", async () => {
    const h = await msHarness();
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    await h.campaign.close();
    const c = await open(h.dir, { testkitFixtureAdmission: h.admission });
    const spy = vi.spyOn(c, "verify");
    try {
      await c.withReadVerification(async (verify) => {
        expect(verify()).toEqual([]);
        expect(verify()).toEqual([]);
        expect(spy).not.toHaveBeenCalled();
      });
    } finally {
      await c.close();
    }
  });
  for (const damaged of ["index", "journal"] as const)
    it(`refuses new ${damaged} corruption at an unchanged canonical head`, async () => {
      const dir = await fixture(130); // a real verified checkpoint, not a caller-asserted proof
      const c = await open(dir);
      const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
      const file =
        damaged === "index"
          ? join(dir, manifest.head.checkpoint.index.file)
          : join(dir, "journal.jsonl");
      const before = readFileSync(file);
      try {
        await c.withReadVerification(async (verify) => {
          expect(verify()).toEqual([]);
          const head = c.store.head();
          const bytes = Buffer.from(before);
          const offset = damaged === "index" ? manifest.head.checkpoint.index.offset : 0;
          bytes[offset] = 33; // invalid JSON/hash at an actually consumed historical proof
          writeFileSync(file, bytes);
          expect(c.store.head()).toEqual(head);
          let refused: boolean;
          try {
            refused = verify().length > 0;
          } catch {
            refused = true;
          }
          expect(refused).toBe(true);
        });
      } finally {
        writeFileSync(file, before);
        await c.close();
      }
    }, 120_000);
});
