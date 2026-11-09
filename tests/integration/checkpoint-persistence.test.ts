// H-07 S1 mechanism evidence: exact v1 identities, verified bounded reopen, and every publication cut.
import { readFileSync, writeFileSync, readdirSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "@immortalis/contracts";
import {
  CanonicalCampaign,
  CampaignCore,
  createFileCampaign,
  openFileCampaign,
  nodeFs,
  sha256Canonical,
  type FileCampaignOptions,
} from "@immortalis/engine";
import {
  TEST_OWNERS,
  group,
  write,
  instrumentFs,
  ACTOR_FIXTURE_EXTENSION,
  fixtureWorld,
  publication,
  FIXTURE_CAMPAIGN,
  SYNTH_EXTENSION,
  syntheticSourceGroup,
} from "@immortalis/testkit";
import { CheckpointManifestSchema } from "../../packages/engine/src/persistence/checkpoint-package.ts";
import { p1Scene, p1Chain } from "../support/auditory-premises.ts";
import { HistoryIndex } from "../../packages/engine/src/persistence/history-index.ts";
import { copyDir, tempDir } from "../support/tmp.ts";
import { must, seededTemporalCampaign } from "../support/temporal.ts";

const C = "h07-mechanism";
const opts = { owners: TEST_OWNERS };
const change = (n: number) =>
  group(
    C,
    n,
    [write("fact/a", n, { expected_version: n - 1 })],
    n > 1 ? { depends_on: [`group-${n - 1}`] } : {},
  );
const manifest = (dir: string) =>
  CheckpointManifestSchema.parse(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")));
async function seed(count: number, options: FileCampaignOptions = {}) {
  const dir = tempDir();
  const store = await must(createFileCampaign(dir, { campaignId: C, ...opts, ...options }));
  for (let n = 1; n <= count; n++) await must(store.commit(change(n)));
  return { dir, store };
}
const reseal = (dir: string, mutate: (m: ReturnType<typeof manifest>) => void) => {
  const m = manifest(dir);
  mutate(m);
  const { self_sha256: old, ...body } = m;
  void old;
  writeFileSync(
    join(dir, "manifest.json"),
    canonicalJson({ ...body, self_sha256: sha256Canonical(body) }),
  );
};
async function openCode(dir: string, options: FileCampaignOptions = {}) {
  const r = await openFileCampaign(dir, { ...opts, ...options });
  if (r.ok) {
    await r.value.close();
    return "OK";
  }
  return r.error.code;
}

describe("H-07 exact receipt/state compatibility and trusted reopening", () => {
  it("identical inputs have identical v1/v2 states, receipts and journal bytes; cold identities stay exact", async () => {
    const a = await seed(260, { legacyFormat: true });
    const b = await seed(260);
    expect(b.store.head()).toEqual(a.store.head());
    expect(b.store.listFacts()).toEqual(a.store.listFacts());
    expect(readFileSync(join(b.dir, "journal.jsonl"))).toEqual(
      readFileSync(join(a.dir, "journal.jsonl")),
    );
    const receipts = Array.from({ length: 260 }, (_, i) =>
      a.store.lookupReceipt(`intent-${i + 1}`),
    );
    await a.store.close();
    await b.store.close();
    const loaded = await must(openFileCampaign(b.dir, opts));
    for (let i = 1; i <= 260; i++) {
      expect(loaded.lookupReceipt(`intent-${i}`)).toEqual(receipts[i - 1]);
      expect(loaded.committedGroupById!(`group-${i}`)).toEqual(change(i));
      expect(loaded.committedGroup(`intent-${i}`)).toEqual(change(i));
    }
    expect(await must(loaded.commit(change(1)))).toEqual({ receipt: receipts[0], replayed: true });
    expect(await loaded.commit({ ...change(1), cause: "changed" })).toMatchObject({
      ok: false,
      error: { code: "INTENT_CONFLICT" },
    });
    expect(await loaded.commit({ ...change(261), group_id: "group-1" })).toMatchObject({
      ok: false,
      error: { code: "GROUP_ID_CONFLICT" },
    });
    await must(loaded.commit(change(261)));
    await loaded.close();
    expect(await openCode(b.dir, { audit: true })).toBe("OK");
  }, 60_000);

  it("cold lookups preserve opaque Unicode identities, including distinct unpaired surrogates", async () => {
    const dir = tempDir();
    const s = await must(createFileCampaign(dir, { campaignId: C, ...opts }));
    const ids = [String.fromCharCode(0xd800), String.fromCharCode(0xd801)];
    for (let n = 1; n <= 130; n++)
      await must(
        s.commit({
          ...change(n),
          depends_on: [],
          ...(n <= 2 ? { group_id: `g:${ids[n - 1]}`, intent_id: `i:${ids[n - 1]}` } : {}),
        }),
      );
    await s.close();
    const reopened = await must(openFileCampaign(dir, opts));
    for (let n = 0; n < ids.length; n++) {
      expect(reopened.lookupReceipt(`i:${ids[n]}`)?.revision).toBe(n + 1);
      expect(reopened.committedGroupById!(`g:${ids[n]}`)?.intent_id).toBe(`i:${ids[n]}`);
    }
    await reopened.close();
    expect(await openCode(dir, { audit: true })).toBe("OK");
  });

  it("2010 historical entries open with only a checkpoint and 90 tail replays; no full journal read or registry", async () => {
    const { dir, store } = await seed(2010);
    await store.close();
    const replay = CampaignCore.prototype.replay;
    let replayed = 0;
    let journalBytes = 0;
    CampaignCore.prototype.replay = function (...args) {
      replayed++;
      return replay.apply(this, args);
    };
    const fs = {
      ...nodeFs,
      readFile: async (path: string) => {
        expect(path.endsWith("journal.jsonl")).toBe(false);
        return nodeFs.readFile(path);
      },
      readRange: async (path: string, offset: number, length: number) => {
        if (path.endsWith("journal.jsonl")) journalBytes += length;
        return nodeFs.readRange(path, offset, length);
      },
    };
    try {
      const s = await must(openFileCampaign(dir, { ...opts, fs }));
      expect(replayed).toBe(90);
      expect(journalBytes).toBe(
        manifest(dir).head.journal_bytes - manifest(dir).head.checkpoint.journal_bytes,
      );
      expect(s.lookupReceipt("intent-1")?.revision).toBe(1);
      expect(replayed).toBe(90);
      await s.close();
    } finally {
      CampaignCore.prototype.replay = replay;
    }
    expect(await openCode(dir, { audit: true })).toBe("OK");
  }, 60_000);

  it("an ordinary one-key commit emits no complete state file; checkpoint work is separate every 128 groups", async () => {
    const { dir, store } = await seed(126);
    await store.close();
    const writes: { path: string; bytes: number }[] = [];
    const fs = {
      ...nodeFs,
      writeFileDurable: async (path: string, data: string | Buffer) => {
        writes.push({ path, bytes: Buffer.byteLength(data) });
        await nodeFs.writeFileDurable(path, data);
      },
    };
    const s = await must(openFileCampaign(dir, { ...opts, fs }));
    await must(s.commit(change(127)));
    expect(writes.filter((w) => /state\.\d+\.json$/.test(w.path))).toEqual([]);
    await must(s.commit(change(128)));
    expect(writes.filter((w) => /state\.\d+\.json$/.test(w.path))).toHaveLength(1);
    expect(manifest(dir).head.checkpoint.revision).toBe(128);
    await s.close();
  });

  it("R1 presence and S1-P1 auditory owner proofs survive a checkpoint and strict audit", async () => {
    const dir = tempDir();
    const scene = await p1Scene(dir);
    await p1Chain(scene);
    for (let n = 1000; n < 1130; n++)
      await must(
        scene.campaign.establishWorld({
          ...publication(n),
          world: fixtureWorld({ world_id: `checkpoint-world-${n}` }),
        }),
      );
    const before = scene.campaign.store.listFacts();
    expect(scene.campaign.verify()).toEqual([]);
    await scene.campaign.close();
    const opened = await must(CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION }));
    expect(opened.verify()).toEqual([]);
    expect(opened.store.listFacts()).toEqual(before);
    await opened.close();
    const strict = await must(
      CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION, audit: true }),
    );
    expect(strict.verify()).toEqual([]);
    await strict.close();
  }, 60_000);

  it("explicit rule-evidence set operations remain exact without eagerly loading the registry", async () => {
    const admission = {
      historyVerificationId: "test-historical-v1",
      check: () => null,
      verifyHistorical: () => null,
    };
    const { dir, store } = await seed(132, { admission });
    await store.close();
    const s = await must(openFileCampaign(dir, { ...opts, admission }));
    const checked = s.ruleCheckedGroupIds!();
    expect(checked.has("group-1")).toBe(true);
    expect(checked.has("missing")).toBe(false);
    expect(checked.size).toBe(132);
    expect([...checked]).toEqual(Array.from({ length: 132 }, (_, i) => `group-${i + 1}`));
    expect(new Set([...checked])).toEqual(
      new Set(Array.from({ length: 132 }, (_, i) => `group-${i + 1}`)),
    );
    expect([...checked.entries()].every(([a, b]) => a === b)).toBe(true);
    await s.close();
    expect(
      await openCode(dir, { admission: { ...admission, historyVerificationId: "foreign-policy" } }),
    ).toBe("OK");
  });
});

describe("H-07 interruption, migration and corruption", () => {
  it("before/after every append, index, checkpoint and head publication reconciles to exactly the original intent", async () => {
    for (const count of [126, 127]) {
      const base = await seed(count);
      await base.store.close();
      const probe = instrumentFs(nodeFs);
      const p = await must(openFileCampaign(copyDir(base.dir), { ...opts, fs: probe.fs }));
      const first = probe.count();
      await must(p.commit(change(count + 1)));
      const last = probe.count();
      const expected = p.head();
      await p.close();
      expect(last - first).toBeGreaterThanOrEqual(count === 127 ? 4 : 2);
      for (let failAt = first + 1; failAt <= last; failAt++)
        for (const when of ["before", "after"] as const) {
          const dir = copyDir(base.dir);
          const inst = instrumentFs(nodeFs, { failAt, when });
          const s = await must(openFileCampaign(dir, { ...opts, fs: inst.fs }));
          const result = await s.commit(change(count + 1));
          if (!result.ok) {
            expect(result.error.code).toBe("UNKNOWN_OUTCOME");
            expect(await s.commit(change(count + 1))).toMatchObject({
              ok: false,
              error: { code: "STORE_POISONED" },
            });
          }
          await s.close();
          const restored = await must(openFileCampaign(dir, opts));
          expect(restored.residue.other_files).toEqual([]);
          const prior = restored.lookupReceipt(`intent-${count + 1}`);
          const again = await must(restored.commit(change(count + 1)));
          expect(again.replayed).toBe(prior !== null);
          expect(restored.head()).toEqual(expected);
          await restored.close();
          expect(await openCode(dir, { audit: true })).toBe("OK");
        }
    }
  }, 60_000);

  it("v1 conversion preserves untouched backup bytes and all identities; every interrupted cut leaves v1 or verified v2 usable", async () => {
    const base = await seed(140, { legacyFormat: true });
    const expected = base.store.head();
    await base.store.close();
    const original = {
      manifest: readFileSync(join(base.dir, "manifest.json")),
      journal: readFileSync(join(base.dir, "journal.jsonl")),
    };
    const probe = instrumentFs(nodeFs);
    const convertedDir = copyDir(base.dir);
    const converted = await must(openFileCampaign(convertedDir, { ...opts, fs: probe.fs }));
    const last = probe.count();
    expect(converted.head()).toEqual(expected);
    expect(manifest(convertedDir).format_version).toBe(2);
    expect(readFileSync(join(convertedDir, "legacy-manifest.v1.backup"))).toEqual(
      original.manifest,
    );
    expect(readFileSync(join(convertedDir, "legacy-journal.v1.backup"))).toEqual(original.journal);
    expect(readFileSync(join(convertedDir, "journal.jsonl"))).toEqual(original.journal);
    expect(converted.lookupReceipt("intent-1")?.revision).toBe(1);
    await converted.close();
    for (let failAt = 2; failAt <= last; failAt++)
      for (const when of ["before", "after"] as const) {
        const dir = copyDir(base.dir);
        const inst = instrumentFs(nodeFs, { failAt, when });
        const interrupted = await openFileCampaign(dir, { ...opts, fs: inst.fs });
        if (interrupted.ok) await interrupted.value.close();
        const restored = await must(openFileCampaign(dir, opts));
        expect(restored.head()).toEqual(expected);
        for (const n of [1, 128, 140])
          expect(restored.committedGroup(`intent-${n}`)).toEqual(change(n));
        await restored.close();
        expect(readFileSync(join(dir, "journal.jsonl"))).toEqual(original.journal);
      }
  }, 60_000);

  it("conversion preserves even an incomplete UTF-8 residue byte-for-byte without adopting it", async () => {
    const { dir, store } = await seed(5, { legacyFormat: true });
    const head = store.head();
    await store.close();
    appendFileSync(join(dir, "journal.jsonl"), Buffer.from([0xf0, 0x90, 0x80]));
    const original = readFileSync(join(dir, "journal.jsonl"));
    const converted = await must(openFileCampaign(dir, opts));
    expect(converted.head()).toEqual(head);
    expect(converted.residue.journal_tail_bytes).toBe(3);
    expect(readFileSync(join(dir, "legacy-journal.v1.backup"))).toEqual(original);
    await must(converted.commit(change(6)));
    await converted.close();
    expect(await openCode(dir, { audit: true })).toBe("OK");
  });

  it("a cold proof consumed by an owner validator refuses the open and releases its writer lock", async () => {
    const dir = tempDir();
    const scene = await seededTemporalCampaign(dir);
    for (let n = 0; n < 130; n++)
      await must(
        scene.campaign.store.commit(
          syntheticSourceGroup(FIXTURE_CAMPAIGN, 50000 + n, n, n + 1, "synthetic/dormant/source"),
        ),
      );
    await scene.campaign.close();
    const path = join(dir, "journal.jsonl");
    const bytes = readFileSync(path, "utf8");
    const first = JSON.parse(bytes.split("\n")[0]!);
    const cause = first.group.cause as string;
    writeFileSync(
      path,
      bytes.replace(JSON.stringify(cause), JSON.stringify(cause.slice(0, -1) + "x")),
    );
    const opened = await CanonicalCampaign.open(dir, { extension: SYNTH_EXTENSION });
    expect(opened).toMatchObject({ ok: false, error: { code: "CANON_INTEGRITY" } });
    expect(readdirSync(dir)).not.toContain("LOCK");
  });

  it("cold archive corruption is deferred on ordinary open, refused on access, and detected by strict audit", async () => {
    const { dir, store } = await seed(260);
    await store.close();
    const path = join(dir, "journal.jsonl");
    const bytes = readFileSync(path, "utf8");
    writeFileSync(path, bytes.replace('"cause":"cause-1"', '"cause":"CAUSE-1"'));
    const s = await must(openFileCampaign(dir, opts));
    expect(() => s.lookupReceipt("intent-1")).toThrow();
    expect(await s.commit(change(261))).toMatchObject({
      ok: false,
      error: { code: "STORE_POISONED" },
    });
    await s.close();
    expect(await openCode(dir, { audit: true })).not.toBe("OK");
  });

  it("tampered checkpoint state, checkpoint proof, index nodes, tail, or manifest fail closed", async () => {
    const base = await seed(260);
    await base.store.close();
    const mutations: ((dir: string) => void)[] = [
      (dir) => writeFileSync(join(dir, manifest(dir).head.state_file), "{}"),
      (dir) =>
        reseal(dir, (m) => {
          m.head.checkpoint.journal_head_sha256 = "f".repeat(64);
        }),
      (dir) =>
        reseal(dir, (m) => {
          m.head.journal_head_sha256 = "e".repeat(64);
        }),
      (dir) => {
        const ref = manifest(dir).head.checkpoint.index!;
        const p = join(dir, ref.file);
        const b = readFileSync(p);
        b[ref.offset] = 32;
        writeFileSync(p, b);
      },
      (dir) => {
        const p = join(dir, "journal.jsonl");
        const b = readFileSync(p);
        b[manifest(dir).head.checkpoint.journal_bytes] = 32;
        writeFileSync(p, b);
      },
      (dir) => rmSync(join(dir, manifest(dir).head.state_file)),
      (dir) =>
        reseal(dir, (m) => {
          m.head.checkpoint.revision = 0;
        }),
    ];
    for (const mutate of mutations) {
      const dir = copyDir(base.dir);
      mutate(dir);
      expect(await openCode(dir)).not.toBe("OK");
      expect(readdirSync(dir)).not.toContain("LOCK");
    }
  });

  it("lost or unreadable writer authority refuses publication and cannot release a successor lock", async () => {
    const { dir, store } = await seed(127);
    const head = store.head();
    writeFileSync(
      join(dir, "LOCK"),
      JSON.stringify({ nonce: "11111111-1111-1111-1111-111111111111", pid: process.pid }),
    );
    expect(await store.commit(change(128))).toMatchObject({
      ok: false,
      error: { code: "STORE_CLOSED" },
    });
    expect(store.head()).toEqual(head);
    await store.close();
    expect(readdirSync(dir)).toContain("LOCK");
  });

  it("a damaged cold index path is refused when that exact proof is consumed", async () => {
    const base = await seed(260);
    await base.store.close();
    const cp = manifest(base.dir).head.checkpoint;
    const index = new HistoryIndex(base.dir, nodeFs);
    expect(index.lookup(cp.index, "i:intent-1")?.revision).toBe(1);
    const ref = cp.index!;
    const p = join(base.dir, ref.file);
    const b = readFileSync(p);
    b[ref.offset] = 32;
    writeFileSync(p, b);
    expect(await openCode(base.dir)).toBe("INTEGRITY_JOURNAL");
  });
});
