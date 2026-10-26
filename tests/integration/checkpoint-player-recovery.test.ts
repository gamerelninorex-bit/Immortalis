// BLUE H-07-S1 R-01: checkpoint recovery must reach the real player-view proof, not just a store head.
// The observation fixture uses shipped commands and a scripted referee (plumbing evidence only).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CanonicalCampaign, nodeFs, type FsOps } from "@immortalis/engine";
import { fixtureWorld, publication } from "@immortalis/testkit";
import {
  openAuthorizedPlayerView,
  readPlayerViewGlance,
} from "../../packages/operator/src/player-view.ts";
import { CheckpointManifestSchema } from "../../packages/engine/src/persistence/checkpoint-package.ts";
import { LOCALITY_CAMPAIGN, openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { observationCampaign, observe } from "../support/observation.ts";
import { bindHost, copyDirs, directGlance, PLAYER_VIEW_HOST } from "../support/player-view.ts";
import { GLANCE_REQUEST, PROTOCOL_REFUSAL } from "../support/protocol.ts";
import { must } from "../support/temporal.ts";

const manifest = (dirs: LocalityDirs) =>
  CheckpointManifestSchema.parse(
    JSON.parse(readFileSync(join(dirs.campaignDir, "manifest.json"), "utf8")),
  );
const nextWorld = (revision: number) => ({
  ...publication(80000 + revision),
  world: fixtureWorld({ world_id: `h07-r01-world-${revision}` }),
});
const params = (dirs: LocalityDirs) => ({
  campaignDir: dirs.campaignDir,
  campaignId: LOCALITY_CAMPAIGN,
  stateDir: dirs.operatorDir,
});
let base: LocalityDirs;
let secret: string;
let expectedGlance: string;

beforeAll(async () => {
  base = (await observationCampaign()).dirs;
  const observed = await observe(base);
  expect(observed.result.status).toBe("OBSERVATION_RECEIVED");
  const bound = await bindHost(base);
  expect(bound.code, bound.out.join("\n")).toBe(0);
  secret = readFileSync(bound.secretFile, "utf8").trim();
  const c = await openOrdinary(base.campaignDir);
  while (c.store.head().revision < 255)
    await must(c.establishWorld(nextWorld(c.store.head().revision + 1)));
  await c.close();
  expect(manifest(base).head.checkpoint.revision).toBe(128);
  expectedGlance = await directGlance(base);
  expect(JSON.parse(expectedGlance).ok).toBe(true);
}, 120_000);

type Cut = "before-manifest" | "after-manifest" | "cleanup";
async function interrupted(cut: Cut, source = base) {
  const dirs = copyDirs(source);
  const previous = manifest(dirs);
  let reached = false;
  const fs: FsOps = {
    ...nodeFs,
    async writeFileDurable(path, data) {
      if (path.endsWith("/manifest.json") && cut !== "cleanup") {
        reached = true;
        if (cut === "after-manifest") await nodeFs.writeFileDurable(path, data);
        throw new Error(`R-01 ${cut}`);
      }
      await nodeFs.writeFileDurable(path, data);
    },
    async remove(path) {
      if (cut === "cleanup" && path === join(dirs.campaignDir, previous.head.state_file)) {
        reached = true;
        throw new Error("R-01 post-publication cleanup failed");
      }
      await nodeFs.remove(path);
    },
  };
  const c = await must(
    CanonicalCampaign.open(dirs.campaignDir, { fs, buildId: "locality-test-reader" }),
  );
  const input = nextWorld(previous.head.revision + 1);
  const result = await c.establishWorld(input);
  if (cut === "cleanup") expect(result.ok).toBe(true);
  else {
    expect(result).toMatchObject({ ok: false, error: { code: "UNKNOWN_OUTCOME" } });
    expect(await c.establishWorld(input)).toMatchObject({
      ok: false,
      error: { code: "STORE_POISONED" },
    });
  }
  await c.close();
  expect(reached).toBe(true);
  expect(readdirSync(dirs.campaignDir).filter((p) => /^state\.\d+\.json$/.test(p))).toHaveLength(2);
  return { dirs, previous, input };
}

const readGlance = (dirs: LocalityDirs) =>
  readPlayerViewGlance({ ...params(dirs), hostId: PLAYER_VIEW_HOST, secret }, GLANCE_REQUEST());

describe("BLUE R-01 checkpoint interruption through actual player reconnect", () => {
  for (const cut of ["before-manifest", "after-manifest", "cleanup"] as const)
    it(`${cut}: immutable-intent retry reaches the same view without duplicate effects or manual cleanup`, async () => {
      const reference = copyDirs(base);
      const expected = await openOrdinary(reference.campaignDir);
      const receipt = await must(expected.establishWorld(nextWorld(256)));
      const head = expected.store.head();
      const facts = expected.store.listFacts();
      await expected.close();
      const { dirs, previous, input } = await interrupted(cut);
      // A complete but UNCOMMITTED checkpoint is never used for canon or player knowledge.
      const proof = await openAuthorizedPlayerView(params(dirs));
      if (cut === "before-manifest") {
        expect(proof).toMatchObject({
          ok: false,
          error: { code: "CAMPAIGN_NOT_RECONCILED" },
        });
        expect(JSON.stringify(await readGlance(dirs))).toBe(PROTOCOL_REFUSAL);
      } else {
        expect(proof.ok, JSON.stringify(proof.ok ? null : proof.error)).toBe(true);
        if (proof.ok) await proof.value.campaign.close();
      }
      expect(readdirSync(dirs.campaignDir).filter((p) => /^state\.\d+\.json$/.test(p))).toEqual([
        manifest(dirs).head.state_file,
      ]);
      const recovered = await openOrdinary(dirs.campaignDir);
      expect(recovered.store.head().revision).toBe(cut === "before-manifest" ? 255 : 256);
      const prior = recovered.store.lookupReceipt(input.intent_id);
      expect(prior !== null).toBe(cut !== "before-manifest");
      const retry = await must(recovered.establishWorld(input));
      expect(retry.receipt).toEqual(receipt.receipt);
      expect(retry.replayed).toBe(cut !== "before-manifest");
      expect(await must(recovered.establishWorld(input))).toEqual({
        receipt: receipt.receipt,
        replayed: true,
      });
      expect(recovered.store.head()).toEqual(head);
      expect(recovered.store.listFacts()).toEqual(facts);
      expect(recovered.store.head().revision).toBe(previous.head.revision + 1);
      await recovered.close();
      for (let reconnect = 0; reconnect < 2; reconnect++) {
        const authorized = await must(openAuthorizedPlayerView(params(dirs)));
        expect(authorized.campaign.store.residue).toEqual({
          journal_tail_bytes: 0,
          other_files: [],
        });
        await authorized.campaign.close();
        expect(JSON.stringify(await readGlance(dirs))).toBe(expectedGlance);
      }
      const audit = await must(CanonicalCampaign.open(dirs.campaignDir, { audit: true }));
      expect(audit.verify()).toEqual([]);
      expect(audit.store.head()).toEqual(head);
      expect(audit.store.lookupReceipt(input.intent_id)).toEqual(receipt.receipt);
      await audit.close();
      expect(
        readdirSync(dirs.campaignDir).filter((p) => /^state\.\d+\.json$/.test(p)),
      ).toHaveLength(1);
    }, 60_000);

  for (const damage of ["unknown", "corrupt-old", "corrupt-aborted", "foreign"] as const)
    it(`${damage} residue still refuses the real player view and remains untouched`, async () => {
      const { dirs } = await interrupted(
        damage === "corrupt-aborted" ? "before-manifest" : "cleanup",
      );
      const m = manifest(dirs);
      let path: string;
      if (damage === "unknown") {
        path = join(dirs.campaignDir, "unrecognized-checkpoint.json");
        writeFileSync(path, "unknown evidence\n");
      } else {
        path = join(
          dirs.campaignDir,
          readdirSync(dirs.campaignDir).find(
            (p) => /^state\.\d+\.json$/.test(p) && p !== m.head.state_file,
          )!,
        );
        const file = JSON.parse(readFileSync(path, "utf8"));
        if (damage === "foreign") file.campaign_id = "other-campaign";
        else file.facts[0].value = { tampered: true };
        writeFileSync(path, JSON.stringify(file));
      }
      const bytes = readFileSync(path);
      const journal = readFileSync(join(dirs.campaignDir, "journal.jsonl"));
      const headBytes = readFileSync(join(dirs.campaignDir, "manifest.json"));
      const proof = await openAuthorizedPlayerView(params(dirs));
      if (proof.ok) await proof.value.campaign.close();
      expect(proof.ok).toBe(false);
      expect(JSON.stringify(await readGlance(dirs))).toBe(PROTOCOL_REFUSAL);
      expect(readFileSync(path)).toEqual(bytes);
      expect(readFileSync(join(dirs.campaignDir, "manifest.json"))).toEqual(headBytes);
      expect(readFileSync(join(dirs.campaignDir, "journal.jsonl"))).toEqual(journal);
      expect(readdirSync(dirs.campaignDir)).not.toContain("LOCK");
    }, 60_000);

  for (const when of ["before", "after"] as const)
    it(`an interruption ${when} verified cleanup refuses that read, then a fresh reconnect recovers`, async () => {
      const { dirs, previous } = await interrupted("cleanup");
      const head = manifest(dirs).head;
      let reached = false;
      const fs: FsOps = {
        ...nodeFs,
        async remove(path) {
          if (path === join(dirs.campaignDir, previous.head.state_file)) {
            reached = true;
            if (when === "after") await nodeFs.remove(path);
            throw new Error(`R-01 ${when} recovery cleanup`);
          }
          await nodeFs.remove(path);
        },
      };
      const proof = await openAuthorizedPlayerView({ ...params(dirs), campaignFs: fs });
      if (proof.ok) await proof.value.campaign.close();
      expect(reached).toBe(true);
      expect(proof.ok).toBe(false);
      expect(JSON.stringify(await readGlance(dirs))).toBe(expectedGlance);
      expect(manifest(dirs).head).toEqual(head);
      const audit = await must(CanonicalCampaign.open(dirs.campaignDir, { audit: true }));
      expect(audit.verify()).toEqual([]);
      await audit.close();
    }, 60_000);

  it("losing writer authority during residue proof cannot remove a checkpoint or a successor lock", async () => {
    const { dirs, previous } = await interrupted("cleanup");
    const head = manifest(dirs).head;
    const path = join(dirs.campaignDir, "LOCK");
    const successor = JSON.stringify({
      nonce: "11111111-1111-1111-1111-111111111111",
      pid: process.pid,
    });
    let reached = false;
    const fs: FsOps = {
      ...nodeFs,
      async readRange(file, offset, length) {
        const bytes = await nodeFs.readRange(file, offset, length);
        if (file.endsWith("/journal.jsonl") && offset === 0 && length === head.journal_bytes) {
          reached = true;
          writeFileSync(path, successor);
        }
        return bytes;
      },
    };
    const proof = await openAuthorizedPlayerView({ ...params(dirs), campaignFs: fs });
    if (proof.ok) await proof.value.campaign.close();
    expect(reached).toBe(true);
    expect(proof.ok).toBe(false);
    expect(readdirSync(dirs.campaignDir)).toContain(previous.head.state_file);
    expect(readFileSync(path, "utf8")).toBe(successor);
    expect(manifest(dirs).head).toEqual(head);
  }, 60_000);
});
