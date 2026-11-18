import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TEMPORAL_STATE_KEY,
  canonicalJson,
  type Publication,
  type Result,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  DiplomacyAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  nodeFs,
  type CommitOutcome,
  type DiplomacyErrorCode,
  type FileCampaignOptions,
} from "@immortalis/engine";
import {
  T0,
  T1,
  diplomacyPublication,
  fixtureWorld,
  publication,
  stopAtBoundaryRequest,
  temporalPublication,
} from "@immortalis/testkit";
import {
  CHECKPOINT_INTERVAL,
  CheckpointManifestSchema,
} from "../../packages/engine/src/persistence/checkpoint-package.ts";
import { reopenDiplomacy, seededDiplomacyCampaign } from "./diplomacy.ts";
import { codeOf, must, spyStore } from "./temporal.ts";
import { tempDir } from "./tmp.ts";

interface OriginalOutcomeCase {
  readonly key: string;
  readonly authored: unknown;
  readonly newKey: string;
  readonly newRecord: (dependencyKey: string) => unknown;
  readonly publish: (
    diplomacy: DiplomacyAdapter,
    publication: Publication,
    authored: unknown,
  ) => Promise<Result<CommitOutcome, DiplomacyErrorCode>>;
  readonly publishOtherKind: (
    diplomacy: DiplomacyAdapter,
    publication: Publication,
  ) => Promise<Result<CommitOutcome, DiplomacyErrorCode>>;
  readonly readDependencies: (diplomacy: DiplomacyAdapter) => unknown;
  readonly changes: readonly (readonly [string, unknown, ("INPUT_INVALID" | "INTENT_CONFLICT")?])[];
}

/** Run the same durable original-outcome witnesses independently for either authored publisher. */
export function describeOriginalOutcomeRecovery(test: OriginalOutcomeCase): void {
  const authoredPublication = diplomacyPublication(1);
  const intent = authoredPublication.intent_id;
  const publish = (diplomacy: DiplomacyAdapter) =>
    test.publish(diplomacy, authoredPublication, test.authored);
  const temporal = (campaign: CanonicalCampaign) =>
    new TemporalCoordinator(campaign.store, new StageProviderRegistry());
  const seed = async (dir: string, fs?: FileCampaignOptions["fs"]) => {
    const seeded = await seededDiplomacyCampaign(dir, { canonical: false, fs });
    await must(
      temporal(seeded.campaign).establishCanonicalTime({ ...temporalPublication(1), time: T0 }),
    );
    return seeded;
  };
  const advance = async (campaign: CanonicalCampaign) => {
    const coordinator = temporal(campaign);
    const before = coordinator.state()!.fact.version;
    await must(
      coordinator.advance(
        stopAtBoundaryRequest("a24-advance", { requested: { target: T1, condition: null } }),
      ),
    );
    expect(coordinator.state()!.fact.version).toBe(before + 1);
  };
  const journal = (dir: string) => readFileSync(join(dir, "journal.jsonl"));
  const snapshot = (campaign: CanonicalCampaign, dir: string) => ({
    head: campaign.store.head(),
    journal: journal(dir),
    group: canonicalJson(campaign.store.committedGroup(intent)),
    receipt: canonicalJson(campaign.store.lookupReceipt(intent)),
    fact: structuredClone(campaign.store.getFact(test.key)),
  });
  const expectReplay = async (campaign: CanonicalCampaign, receipt: string) => {
    const spy = spyStore(campaign.store);
    const retry = await must(publish(new DiplomacyAdapter(spy.store)));
    expect(retry.replayed).toBe(true);
    expect(canonicalJson(retry.receipt)).toBe(receipt);
    expect(spy.getFacts).toEqual([]);
    expect(spy.listCalls()).toBe(0);
    expect(spy.commits.map(canonicalJson)).toEqual([
      canonicalJson(campaign.store.committedGroup(intent)),
    ]);
  };
  const invalidated = { current: false, invalidated: [TEMPORAL_STATE_KEY] };

  describe("original-outcome recovery with a real mutable Temporal dependency", () => {
    it("replays exact canonical receipt and group bytes before and after advance and verified reopen", async () => {
      const dir = tempDir();
      const { campaign, diplomacy } = await seed(dir);
      expect((await must(publish(diplomacy))).replayed).toBe(false);
      const initial = snapshot(campaign, dir);
      expect(test.readDependencies(diplomacy)).toEqual({ current: true, invalidated: [] });
      await expectReplay(campaign, initial.receipt);
      expect(snapshot(campaign, dir)).toEqual(initial);

      await advance(campaign);
      const advanced = snapshot(campaign, dir);
      expect(advanced).toMatchObject({
        group: initial.group,
        receipt: initial.receipt,
        fact: initial.fact,
      });
      await expectReplay(campaign, initial.receipt);
      expect(snapshot(campaign, dir)).toEqual(advanced);
      expect(test.readDependencies(diplomacy)).toEqual(invalidated);
      await campaign.close();

      const reopened = await reopenDiplomacy(dir);
      await expectReplay(reopened.campaign, initial.receipt);
      expect(snapshot(reopened.campaign, dir)).toEqual(advanced);
      expect(test.readDependencies(reopened.diplomacy)).toEqual(invalidated);
      expect(reopened.campaign.verify()).toEqual([]);
      await reopened.campaign.close();
    });

    it("refuses changed authorship, publication identity and a different diplomatic kind without writes", async () => {
      const dir = tempDir();
      const { campaign, diplomacy } = await seed(dir);
      await must(publish(diplomacy));
      await advance(campaign);
      const before = snapshot(campaign, dir);
      const spy = spyStore(campaign.store);
      const adapter = new DiplomacyAdapter(spy.store);
      for (const field of ["group_id", "cause", "basis", "secrecy"] as const) {
        const changed = { ...authoredPublication, [field]: "changed-publication" };
        expect(await codeOf(test.publish(adapter, changed, test.authored)), field).toBe(
          "INTENT_CONFLICT",
        );
      }
      for (const [name, authored, code = "INTENT_CONFLICT"] of test.changes) {
        expect(await codeOf(test.publish(adapter, authoredPublication, authored)), name).toBe(code);
      }
      expect(await codeOf(test.publishOtherKind(adapter, authoredPublication))).toBe(
        "INTENT_CONFLICT",
      );
      expect(await codeOf(test.publish(adapter, diplomacyPublication(2), test.authored))).toBe(
        "VERSION_CONFLICT",
      );
      expect(snapshot(campaign, dir)).toEqual(before);
      // The occupied-key check above is the only attempt that reaches fresh store admission.
      expect(spy.getFacts).toEqual([TEMPORAL_STATE_KEY]);
      expect(spy.commits.map((group) => group.intent_id)).toEqual([
        diplomacyPublication(2).intent_id,
      ]);
      expect(spy.listCalls()).toBe(0);
      await campaign.close();
    });

    it("applies current dependency admission to a fresh intent", async () => {
      const dir = tempDir();
      const { campaign, diplomacy } = await seed(dir);
      await must(publish(diplomacy));
      const original = campaign.store.committedGroup(intent)!;
      await advance(campaign);
      const before = snapshot(campaign, dir);
      const fresh = diplomacyPublication(2);
      const authored = test.newRecord(TEMPORAL_STATE_KEY);
      const stale = {
        ...original,
        group_id: fresh.group_id,
        intent_id: fresh.intent_id,
        cause: fresh.cause,
        writes: [{ ...original.writes[0]!, key: test.newKey, value: authored }],
      };
      expect(await codeOf(campaign.store.commit(stale))).toBe("STALE_READ");
      expect(
        await codeOf(test.publish(diplomacy, fresh, test.newRecord("world/uncommitted/profile"))),
      ).toBe("PREREQUISITE_MISSING");
      expect(snapshot(campaign, dir)).toEqual(before);
      expect(campaign.store.getFact(test.newKey)).toBeUndefined();
      const first = await must(test.publish(diplomacy, fresh, authored));
      expect(first.replayed).toBe(false);
      expect(campaign.store.committedGroup(fresh.intent_id)?.reads).toEqual([
        { key: TEMPORAL_STATE_KEY, version: 2 },
      ]);
      expect(await must(test.publish(diplomacy, fresh, authored))).toEqual({
        replayed: true,
        receipt: first.receipt,
      });
      expect(campaign.store.head().revision).toBe(before.head.revision + 1);
      expect(campaign.store.getFact(test.newKey)?.version).toBe(1);
      expect(campaign.verify()).toEqual([]);
      await campaign.close();
    });

    it("fails closed when the original group or its matching receipt cannot be established", async () => {
      const dir = tempDir();
      const { campaign, diplomacy } = await seed(dir);
      await must(publish(diplomacy));
      await advance(campaign);
      const before = snapshot(campaign, dir);
      const group = campaign.store.committedGroup(intent)!;
      const receipt = campaign.store.lookupReceipt(intent)!;
      const cases = [
        { committedGroup: () => null },
        { lookupReceipt: () => null },
        { lookupReceipt: () => ({ ...receipt, state_sha256: "" }) },
        { lookupReceipt: () => ({ ...receipt, campaign_id: "other-campaign" }) },
        { committedGroup: () => ({ ...group, writes: [] }) },
        { committedGroup: () => ({ ...group, reads: [], depends_on: [] }) },
      ];
      for (const missingEvidence of cases) {
        const spy = spyStore(campaign.store);
        expect(
          await codeOf(publish(new DiplomacyAdapter({ ...spy.store, ...missingEvidence }))),
        ).toBe("INTENT_CONFLICT");
        expect(spy.getFacts).toEqual([]);
        expect(spy.commits).toEqual([]);
        expect(spy.listCalls()).toBe(0);
      }
      expect(snapshot(campaign, dir)).toEqual(before);
      await campaign.close();
    });

    it.each(["before append", "after manifest"] as const)(
      "reconciles UNKNOWN_OUTCOME %s across upstream advance and verified reopen",
      async (cut) => {
        const dir = tempDir();
        let armed = false;
        const fs = {
          ...nodeFs,
          async appendDurable(path: string, data: string) {
            if (armed && cut === "before append") throw new Error("interrupted before append");
            await nodeFs.appendDurable(path, data);
          },
          async writeFileDurable(path: string, data: string | Buffer) {
            await nodeFs.writeFileDurable(path, data);
            if (armed && cut === "after manifest" && path === join(dir, "manifest.json")) {
              throw new Error("lost reply after manifest publication");
            }
          },
        };
        const seeded = await seed(dir, fs);
        const before = snapshot(seeded.campaign, dir);
        armed = true;
        expect(await codeOf(publish(seeded.diplomacy))).toBe("UNKNOWN_OUTCOME");
        await seeded.campaign.close();

        const recovered = await reopenDiplomacy(dir);
        const original = snapshot(recovered.campaign, dir);
        const committed = cut === "after manifest";
        expect(original.head.revision).toBe(before.head.revision + Number(committed));
        expect(recovered.campaign.store.lookupReceipt(intent) !== null).toBe(committed);
        expect(recovered.campaign.store.getFact(test.key) !== undefined).toBe(committed);
        await advance(recovered.campaign);
        if (committed) {
          // Force the original group through the checkpoint's cold intent index.
          for (let n = recovered.campaign.store.head().revision; n < CHECKPOINT_INTERVAL; n++) {
            await must(
              recovered.campaign.establishWorld({
                ...publication(n),
                world: fixtureWorld({ world_id: `a24-checkpoint-world-${n}` }),
              }),
            );
          }
          const manifest = CheckpointManifestSchema.parse(
            JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")),
          );
          expect(manifest.head.checkpoint.revision).toBe(CHECKPOINT_INTERVAL);
          expect(manifest.head.checkpoint.revision).toBeGreaterThan(original.head.revision);
        }
        const advanced = snapshot(recovered.campaign, dir);
        await recovered.campaign.close();

        const journalPath = join(dir, "journal.jsonl");
        const fullReads: string[] = [];
        const ranges: { offset: number; length: number }[] = [];
        const reopened = await must(
          CanonicalCampaign.open(dir, {
            fs: {
              ...nodeFs,
              readFile(path) {
                if (path === journalPath) fullReads.push(path);
                return nodeFs.readFile(path);
              },
              readRange(path, offset, length) {
                if (path === journalPath) ranges.push({ offset, length });
                return nodeFs.readRange(path, offset, length);
              },
              readRangeSync(path, offset, length) {
                if (path === journalPath) ranges.push({ offset, length });
                return nodeFs.readRangeSync(path, offset, length);
              },
            },
          }),
        );
        const diplomacy = new DiplomacyAdapter(reopened.store);
        fullReads.length = 0;
        ranges.length = 0;
        if (committed) {
          const [name, changed] = test.changes[0]!;
          expect(await codeOf(test.publish(diplomacy, authoredPublication, changed)), name).toBe(
            "INTENT_CONFLICT",
          );
          await expectReplay(reopened, original.receipt);
          expect(fullReads).toEqual([]);
          expect(ranges.length).toBeGreaterThan(0);
          expect(
            ranges.every(
              (range) => range.offset === ranges[0]!.offset && range.length === ranges[0]!.length,
            ),
          ).toBe(true);
          expect(ranges[0]!.length).toBeLessThan(advanced.journal.length);
          expect(snapshot(reopened, dir)).toEqual(advanced);
          expect(test.readDependencies(diplomacy)).toEqual(invalidated);
        } else {
          const result = await must(publish(diplomacy));
          expect(result.replayed).toBe(false);
          expect(reopened.store.head().revision).toBe(advanced.head.revision + 1);
          expect(reopened.store.committedGroup(intent)?.reads).toEqual([
            { key: TEMPORAL_STATE_KEY, version: 2 },
          ]);
          expect(test.readDependencies(diplomacy)).toEqual({ current: true, invalidated: [] });
          const established = snapshot(reopened, dir);
          await expectReplay(reopened, established.receipt);
          expect(snapshot(reopened, dir)).toEqual(established);
        }
        expect(reopened.store.getFact(test.key)?.version).toBe(1);
        expect(reopened.verify()).toEqual([]);
        await reopened.close();
      },
    );
  });
}
