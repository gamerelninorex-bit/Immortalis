import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CampaignCore,
  CanonicalCampaign,
  CANONICAL_OWNER_REGISTRY,
  GipAdapter,
  canonicalAdmission,
  inspectMsFenceView,
  msFenceMetrics,
  resolveKey,
  nodeFs,
  type CampaignState,
} from "@immortalis/engine";
import { gipPublication, institutionIdentity } from "@immortalis/testkit";
import { tempDir } from "../support/tmp.ts";
import { msHarness } from "../support/ms-setup.ts";
import { must } from "../support/temporal.ts";
import { HistoryIndex } from "../../packages/engine/src/persistence/history-index.ts";

describe("F-1 bounded verified checkpoint fence derivation", () => {
  for (const size of [128, 256, 512])
    it(
      "adds no per-fact historical checks on a no-MS checkpoint with " + size + " records",
      async () => {
        const dir = tempDir();
        const c = await must(
          CanonicalCampaign.create(dir, { campaignId: "f1-no-ms", buildId: "test" }),
        );
        const gip = new GipAdapter(c.store);
        for (let n = 0; n < size; n++)
          await must(
            gip.establishInstitution({
              ...gipPublication(n + 1),
              institution: institutionIdentity("f1-" + n),
            }),
          );
        await c.close();
        let calls = 0;
        let state: CampaignState | undefined;
        const opened = await must(
          CanonicalCampaign.open(dir, {
            testkitFixtureAdmission: {
              ...canonicalAdmission,
              initializeView(s, checked) {
                state = s;
                canonicalAdmission.initializeView!(s, (id) => {
                  calls++;
                  return checked(id);
                });
              },
            },
          }),
        );
        expect(calls).toBe(0);
        expect(inspectMsFenceView(state!)).toMatchObject({ hasMs: false, released: false });
        const scans = msFenceMetrics.scans;
        await must(
          new GipAdapter(opened.store).establishInstitution({
            ...gipPublication(size + 1),
            institution: institutionIdentity("f1-next"),
          }),
        );
        expect(msFenceMetrics.scans).toBe(scans);
        if (size === 128) {
          // The open's verified-node cache must have ended. A later cold lookup consumes
          // disk evidence again and detects corruption even for a node read during open.
          const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
          const ref = manifest.head.checkpoint.index as { file: string; offset: number };
          const path = join(dir, ref.file),
            bytes = readFileSync(path);
          bytes[ref.offset] = 32;
          writeFileSync(path, bytes);
          expect(() => opened.store.lookupReceipt(gipPublication(1).intent_id)).toThrow();
        }
        await opened.close();
      },
      30_000,
    );

  it("checks only MS summary milestones, refuses missing evidence and never binds a detached non-genesis state", async () => {
    const h = await msHarness({ priorScopeSessions: 2 });
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    const gip = new GipAdapter(h.store);
    for (let n = 0; n < 16; n++)
      await must(
        gip.establishInstitution({
          ...gipPublication(n + 1),
          institution: institutionIdentity("ms-later-" + n),
        }),
      );
    const checked = h.store.ruleCheckedGroupIds!();
    const state = h.state();
    const core = (missing: boolean, withHistory: boolean) => {
      let calls = 0;
      const c = new CampaignCore({
        campaignId: h.campaignId,
        state: { ...state },
        headSha256: "0".repeat(64),
        specLockSha256: "0".repeat(64),
        owners: CANONICAL_OWNER_REGISTRY,
        admission: h.admission,
        ...(withHistory
          ? {
              history: {
                byIntent: () => null,
                byGroup: () => null,
                ruleChecked: (id: string) => {
                  calls++;
                  return !missing && checked.has(id);
                },
                checkedIds: () => checked,
              },
            }
          : {}),
      });
      return { c, calls };
    };
    const valid = core(false, true);
    expect(valid.calls).toBe(5);
    expect(inspectMsFenceView(valid.c.state)).toMatchObject({ hasMs: true, released: true });
    const completion = h.store
      .listFacts()
      .find((f) => resolveKey(f.key)?.kind.id === "initial_locality_completion")!;
    expect(inspectMsFenceView(valid.c.state)?.input).toEqual(
      (completion.value as { input: unknown }).input,
    );
    expect(inspectMsFenceView(core(true, true).c.state)).toBeNull();
    expect(inspectMsFenceView(core(false, false).c.state)).toBeNull();
    await h.campaign.close();
  });

  it("reuses verified index nodes only within one synchronous check and drops them on success or exception", async () => {
    let reads = 0;
    const dir = tempDir();
    await nodeFs.mkdirp(join(dir, "history"));
    const index = new HistoryIndex(dir, {
      ...nodeFs,
      readRangeSync(path, offset, length) {
        reads++;
        return nodeFs.readRangeSync(path, offset, length);
      },
    });
    const location = { offset: 0, length: 1, sha256: "a".repeat(64), checked: true, revision: 1 };
    const root = await index.extend(
      null,
      [
        ["i:a", location],
        ["g:a", location],
      ],
      1,
    );
    reads = 0;
    index.withVerifiedReadCache(() => {
      expect(index.lookup(root, "i:a")).toEqual(location);
      const first = reads;
      expect(first).toBeGreaterThan(0);
      expect(index.lookup(root, "i:a")).toEqual(location);
      expect(reads).toBe(first);
    });
    const after = reads;
    index.lookup(root, "i:a");
    expect(reads).toBeGreaterThan(after);
    expect(() =>
      index.withVerifiedReadCache(() => {
        index.lookup(root, "i:a");
        throw new Error("TEST: verification failed");
      }),
    ).toThrow("verification failed");
    const afterFailure = reads;
    index.lookup(root, "i:a");
    expect(reads).toBeGreaterThan(afterFailure);
  });
});
