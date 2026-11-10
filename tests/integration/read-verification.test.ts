/* eslint-disable @typescript-eslint/no-explicit-any -- deliberate same-head corruption and expired-handle probes */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CanonicalCampaign, resolveKey } from "@immortalis/engine";
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
      await expect(
        c.withReadVerification(async (verify) => {
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
        }),
      ).rejects.toThrow("basis changed");
    } finally {
      await c.close();
    }
  });

  it("invalidates on an actual owner commit, including a newly admitted previously absent fact", async () => {
    const c = await open(await fixture());
    const spy = vi.spyOn(c, "verify");
    try {
      await expect(
        c.withReadVerification(async (verify) => {
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
        }),
      ).rejects.toThrow("basis changed");
      expect(c.store.getFact("world/later/profile")).toBeDefined();
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
        ).rejects.toThrow(/Cannot read private member #readVerification/);
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

// Observation never asserts: a failed expectation cannot masquerade as a production refusal.
function observe(read: () => unknown) {
  try {
    return { kind: "returned", value: read() } as const;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { kind: "threw", name: error.name, message: error.message } as const;
  }
}
async function settle(read: Promise<unknown>) {
  try {
    return { kind: "returned", value: await read } as const;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { kind: "threw", name: error.name, message: error.message } as const;
  }
}

describe("fresh backing evidence at entry, mid-callback and final cuts", () => {
  let checkpointDir: string;
  let ms: Awaited<ReturnType<typeof msHarness>>;
  beforeAll(async () => {
    checkpointDir = await fixture(130); // real verified checkpoint and historical journal
    ms = await msHarness();
    expect(await ms.actorService.advance()).toEqual({ status: "COMPLETED" });
    await ms.campaign.close();
  }, 120_000);

  it("withholds output after a same-head change following the callback's last verification/await", async () => {
    const c = await open(await fixture());
    const fact = c.store.getFact("world/world-0/profile") as any;
    const original = fact.value.premise;
    try {
      await expect(
        c.withReadVerification(async (verify) => {
          expect(verify()).toEqual([]);
          await Promise.resolve();
          fact.value.premise += " altered after verification";
          return "must not escape";
        }),
      ).rejects.toThrow("basis changed");
    } finally {
      fact.value.premise = original;
      await c.close();
    }
  });
  it("reuses the actual M-S owner chain and its addressed rule-checked evidence", async () => {
    const c = await open(ms.dir, { testkitFixtureAdmission: ms.admission });
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

  for (const cut of ["entry", "mid", "final"] as const) {
    for (const addressed of [
      "lookupReceipt",
      "committedGroup",
      "committedGroupById",
      "ruleCheckedGroupIds",
    ] as const)
      it(`strict fallback for ${addressed} at ${cut}`, async () => {
        const c = await open(ms.dir, { testkitFixtureAdmission: ms.admission });
        const strict = vi.spyOn(c, "verify");
        const completion = c.store
          .listFacts()
          .find((f) => resolveKey(f.key)?.kind.id === "initial_locality_completion")!;
        const group = c.store.committedGroup(completion.provenance.intent_id)!;
        const target =
          addressed === "committedGroupById"
            ? group.depends_on[0]!
            : completion.provenance.intent_id;
        if (addressed === "ruleCheckedGroupIds")
          expect(c.store.ruleCheckedGroupIds!().has(group.group_id)).toBe(true);
        else expect(c.store[addressed]!(target)).not.toBeNull();
        const head = c.store.head();
        let fault: { mockRestore: () => void } | undefined;
        // The original open has already verified this real M-S chain. Alter only one addressed
        // evidence response, keeping facts/head and every other response unchanged.
        const damage = () => {
          if (addressed === "ruleCheckedGroupIds") {
            const original = c.store.ruleCheckedGroupIds!.bind(c.store);
            fault = vi
              .spyOn(c.store, addressed)
              .mockImplementation(
                () => new Set([...original()].filter((id) => id !== group.group_id)),
              );
          } else {
            const original = c.store[addressed]!.bind(c.store);
            fault = vi
              .spyOn(c.store as any, addressed)
              .mockImplementation((id: any) => (id === target ? null : original(id)));
          }
        };
        let healthy: ReturnType<typeof observe> | undefined;
        let immediate: ReturnType<typeof observe> | undefined;
        try {
          if (cut === "entry") damage();
          const scope = await settle(
            c.withReadVerification(async (verify) => {
              if (cut !== "entry") healthy = observe(verify);
              await Promise.resolve();
              if (cut !== "entry") damage();
              if (cut !== "final") immediate = observe(verify);
              return "must not escape";
            }),
          );
          // All assertions about refusal live OUTSIDE the production callback and its rejection.
          if (cut !== "entry") expect(healthy).toEqual({ kind: "returned", value: [] });
          expect(c.store.head()).toEqual(head);
          expect(scope).toEqual({
            kind: "threw",
            name: "Error",
            message: "verification read basis changed",
          });
          expect(strict).toHaveBeenCalledTimes(cut === "final" ? 1 : 2);
          const baseline = observe(() => c.verify());
          expect(baseline.kind).toBe("returned");
          if (baseline.kind !== "returned") throw new Error("strict baseline unexpectedly threw");
          expect(baseline.value).not.toEqual([]);
          if (cut !== "final") expect(immediate).toEqual(baseline);
          fault!.mockRestore();
          fault = undefined;
          expect(c.verify()).toEqual([]); // the real positive path still works after restoration
        } finally {
          fault?.mockRestore();
          await c.close();
        }
      });

    for (const damaged of ["index", "journal", "unreadable-journal"] as const)
      it(`refuses ${damaged} historical replay at ${cut}`, async () => {
        const c = await open(checkpointDir);
        const strict = vi.spyOn(c, "verify");
        const manifest = JSON.parse(readFileSync(join(checkpointDir, "manifest.json"), "utf8"));
        const file =
          damaged === "index"
            ? join(checkpointDir, manifest.head.checkpoint.index.file)
            : join(checkpointDir, "journal.jsonl");
        const before = readFileSync(file);
        const head = c.store.head();
        const damage = () => {
          if (damaged === "unreadable-journal") rmSync(file);
          else {
            const bytes = Buffer.from(before);
            bytes[damaged === "index" ? manifest.head.checkpoint.index.offset : 0] = 33;
            writeFileSync(file, bytes);
          }
        };
        let healthy: ReturnType<typeof observe> | undefined;
        let immediate: ReturnType<typeof observe> | undefined;
        try {
          if (cut === "entry") damage();
          const scope = await settle(
            c.withReadVerification(async (verify) => {
              if (cut !== "entry") healthy = observe(verify);
              await Promise.resolve();
              if (cut !== "entry") damage();
              if (cut !== "final") immediate = observe(verify);
              return "must not escape";
            }),
          );
          if (cut !== "entry") expect(healthy).toEqual({ kind: "returned", value: [] });
          expect(c.store.head()).toEqual(head);
          expect(strict).toHaveBeenCalledTimes(cut === "final" ? 1 : 2);
          const baseline = observe(() => c.verify());
          expect(baseline.kind).toBe("threw");
          if (baseline.kind !== "threw") throw new Error("strict baseline failed to refuse");
          expect(baseline.message).toMatch(/history|JSON|journal|Unexpected|ENOENT/);
          expect(scope).toEqual(baseline); // exact strict historical-read failure, never an assertion
          if (cut !== "final") expect(immediate).toEqual(baseline);
        } finally {
          writeFileSync(file, before);
          await c.close();
        }
      }, 120_000);
  }
});
