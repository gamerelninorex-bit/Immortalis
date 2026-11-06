/* eslint-disable @typescript-eslint/no-explicit-any -- tests craft raw journal bytes and spy on the digest to inject and observe faults */
// H-07 S3 MECHANISM evidence (T1): the strict historical replay of a policy-transition first open now re-derives every receipt's full-state
// SHA-256 with an incremental evaluator (see packages/engine/src/commit/state-digest.ts) instead of re-serialising and re-hashing the
// whole state from scratch at each revision. These tests show that, for growing state, for one-fact history and for adversarial rewrites of
// an early, middle, late or rotating EXISTING fact, the recomputed digest at EVERY revision is the byte-for-byte digest the reference and an
// independent definition produce, that every canonical result is unchanged, and that nothing a tampered, interrupted or concurrent
// open does can publish a successor or a false receipt. Synthetic disposable packages only; no live campaign, host, model or provider.
// The matched whole-operation cost evidence is docs/evidence/h07-s3-strict-replay-hashing-cost.md.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILD_SPEC_IDENTITY,
  RUNTIME_CONTRACT_SNAPSHOT,
  canonicalJson,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  canonicalAdmission,
  entryHash,
  nodeFs,
  openFileCampaign,
  type FileCampaignOptions,
  type FileCampaignStore,
  type FsOps,
} from "@immortalis/engine";
import {
  fixtureLocus,
  fixtureWorld,
  group,
  instrumentFs,
  publication,
  sourceInput,
  write,
} from "@immortalis/testkit";
import { CheckpointManifestSchema } from "../../packages/engine/src/persistence/checkpoint-package.ts";
import { IncrementalStateDigest } from "../../packages/engine/src/commit/state-digest.ts";
import {
  NEW_POLICY_ID,
  OLD_POLICY_ID,
  POLICY_CAMPAIGN,
  SHAPES,
  countReplays,
  optionsFor,
  oracleStateDigests,
  policyAdmission,
  seedFs,
  seedGrowth,
  seedOldPolicy,
  seedShape,
  type Shape,
} from "../support/policy-transition.ts";
import { must } from "../support/temporal.ts";
import { copyDir, snapshotDir, tempDir } from "../support/tmp.ts";

const manifestOf = (dir: string) =>
  CheckpointManifestSchema.parse(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")));
const manifestBytes = (dir: string) => readFileSync(join(dir, "manifest.json"));
const journalBytes = (dir: string) => readFileSync(join(dir, "journal.jsonl"));
const stateFiles = (dir: string) => readdirSync(dir).filter((f) => /^state\.\d+\.json$/.test(f));
const journalEntries = (dir: string) =>
  journalBytes(dir)
    .toString("utf8")
    .split("\n")
    .filter((l) => l !== "")
    .map(
      (l) => JSON.parse(l) as { revision: number; group: any; receipt: any; entry_sha256: string },
    );
const probes = (n: number) => [1, Math.ceil(n / 2), n];
const openNew = (dir: string, extra: FileCampaignOptions = {}) =>
  openFileCampaign(dir, optionsFor(policyAdmission(NEW_POLICY_ID).admission, extra));
const removeLockArtifacts = (dir: string) => {
  for (const name of readdirSync(dir))
    if (name === "LOCK" || name.startsWith("LOCK.")) rmSync(join(dir, name));
};
const next = (n: number) =>
  group(
    POLICY_CAMPAIGN,
    n,
    [write(`future/${String(n).padStart(6, "0")}`, { after: "transition" })],
    { depends_on: [`group-${n - 1}`] },
  );

/** Everything that identifies the saved world: head, facts and exact historical receipts and groups at probe points. */
async function identity(store: FileCampaignStore, n: number) {
  return {
    head: store.head(),
    facts: store.listFacts(),
    receipts: probes(n).map((i) => store.lookupReceipt(`intent-${i}`)),
    groups: probes(n).map((i) => store.committedGroupById?.(`group-${i}`) ?? null),
    byIntent: probes(n).map((i) => store.committedGroup(`intent-${i}`)),
  };
}

/** Records every digest the incremental evaluator returns (and which evaluator), around one action. */
async function spyOnDigest<T>(action: () => Promise<T>) {
  const real = IncrementalStateDigest.prototype.digest;
  const results: string[] = [];
  const instances = new Set<IncrementalStateDigest>();
  IncrementalStateDigest.prototype.digest = function (this: IncrementalStateDigest, ...args) {
    const digest = real.apply(this, args);
    results.push(digest);
    instances.add(this);
    return digest;
  };
  try {
    const result = await action();
    return { result, results, instances: [...instances] };
  } finally {
    IncrementalStateDigest.prototype.digest = real;
  }
}

/** Revisions an independent digest is recomputed at: all of them for short histories, a spread (and every boundary) for long ones. */
const sampledRevisions = (n: number): ReadonlySet<number> | "all" => {
  if (n <= 140) return "all";
  const out = new Set<number>([1, 2, n - 1, n]);
  for (let r = 1; r <= n; r += 37) out.add(r);
  for (const r of [127, 128, 129, 255, 256, 257, 383, 384, 385]) if (r <= n) out.add(r);
  return out;
};

/**
 * One first open under a changed policy of a package written by the ordinary path, held to every canonical consequence:
 * the optimized digest equals the recorded receipt at every revision (and an independent definition at the sampled ones), one strict
 * pass judges each group once, the saved world and the journal bytes are unchanged, a real new intent is accepted, replayed
 * idempotently and refused when altered, and a cold reopen, every historical lookup and a strict audit all remain lawful.
 */
async function exerciseTransition(dir: string, n: number) {
  const original = journalBytes(dir);
  const recorded = journalEntries(dir);
  expect(recorded).toHaveLength(n);
  const reference = await must(
    openFileCampaign(dir, optionsFor(policyAdmission(OLD_POLICY_ID).admission)),
  );
  const expected = await identity(reference, n);
  await reference.close();
  expect(manifestOf(dir).head.checkpoint.verification_policy).toBe(OLD_POLICY_ID);

  const counting = policyAdmission(NEW_POLICY_ID);
  const spied = await spyOnDigest(() =>
    countReplays(() => must(openFileCampaign(dir, optionsFor(counting.admission)))),
  );
  const opened = spied.result;
  const store = opened.result;
  // one strict pass: every journal entry replayed and every group judged by the CURRENT verifier exactly once
  expect(opened.entries).toBe(n);
  expect(opened.cores).toBe(1);
  expect(counting.verified()).toBe(n);
  // the optimized evaluator produced the receipt digest of EVERY revision, equal to the one recorded by the unchanged writer...
  expect(spied.results).toEqual(recorded.map((e) => e.receipt.state_sha256));
  // ...it did so incrementally (one build from the empty state, never the reference fallback)...
  expect(spied.instances).toHaveLength(1);
  expect(spied.instances[0]!.stats).toEqual({ digests: n, rebuilds: 1, fallbacks: 0 });
  // ...and the recorded digests are themselves the specification's, by a definition that shares no code with the core
  const sampled = sampledRevisions(n);
  const oracle = oracleStateDigests(original.toString("utf8"), sampled);
  expect(oracle.size).toBe(sampled === "all" ? n : sampled.size);
  for (const [revision, digest] of oracle)
    expect(digest, `revision ${revision}`).toBe(recorded[revision - 1]!.receipt.state_sha256);

  // canonical results are unchanged
  expect(await identity(store, n)).toEqual(expected);
  expect(journalBytes(dir).equals(original)).toBe(true);
  expect(store.head().state_sha256).toBe(recorded[n - 1]!.receipt.state_sha256);
  const published = manifestOf(dir);
  expect(published.head.checkpoint).toMatchObject({
    verification_policy: NEW_POLICY_ID,
    revision: n,
    journal_entries: n,
    journal_bytes: original.length,
    state_sha256: recorded[n - 1]!.receipt.state_sha256,
    journal_head_sha256: recorded[n - 1]!.entry_sha256,
  });
  expect(stateFiles(dir)).toEqual([published.head.state_file]);
  expect(store.residue.other_files).toEqual([]);

  // a real new intent continues the chain; the same intent is idempotent; an altered one is refused
  const fresh = await must(store.commit(next(n + 1)));
  expect(fresh.replayed).toBe(false);
  expect(fresh.receipt.revision).toBe(n + 1);
  expect(await must(store.commit(next(n + 1)))).toEqual({ receipt: fresh.receipt, replayed: true });
  expect(await store.commit({ ...next(n + 1), cause: "changed" })).toMatchObject({
    ok: false,
    error: { code: "INTENT_CONFLICT" },
  });
  await store.close();
  expect(journalBytes(dir).subarray(0, original.length).equals(original)).toBe(true);

  // a cold reopen replays the bounded tail only, resolves EVERY historical identity exactly, and a strict audit passes
  const again = policyAdmission(NEW_POLICY_ID);
  const cold = await countReplays(() => must(openFileCampaign(dir, optionsFor(again.admission))));
  expect(cold.entries).toBe(1);
  expect(again.verified()).toBe(1);
  expect(cold.result.lookupReceipt(`intent-${n + 1}`)).toEqual(fresh.receipt);
  for (let i = 1; i <= n; i++) {
    expect(cold.result.lookupReceipt(`intent-${i}`)).toEqual(recorded[i - 1]!.receipt);
    expect(cold.result.committedGroupById!(`group-${i}`)).toEqual(recorded[i - 1]!.group);
    expect(cold.result.committedGroup(`intent-${i}`)).toEqual(recorded[i - 1]!.group);
  }
  await cold.result.close();
  const audit = await countReplays(() =>
    must(
      openFileCampaign(dir, optionsFor(policyAdmission(NEW_POLICY_ID).admission, { audit: true })),
    ),
  );
  expect(audit.entries).toBe(n + 1);
  await audit.result.close();
  expect(readdirSync(dir)).not.toContain("LOCK");
}

describe("H-07 S3: the strict replay re-derives every receipt digest through the incremental evaluator", () => {
  it.each([3, 103, 503, 2003])(
    "growing state and history, %i entries: identical digests at every revision, one pass, unchanged canon, lawful future",
    async (n) => {
      await exerciseTransition(await seedGrowth(n, n), n);
    },
    900_000,
  );

  it.each(SHAPES)(
    "a fixed-size state whose history rewrites an existing fact at the %s position: identical digests at every revision",
    async (kind: Shape) => {
      await exerciseTransition(await seedShape(kind, 300, 300), 600);
    },
    600_000,
  );

  it("a large one-fact growing history (3,003 entries): identical digests and unchanged canon", async () => {
    await exerciseTransition(await seedOldPolicy(3003), 3003);
  }, 900_000);

  it(
    "an independent fresh process performs the transition on a growing-state package, and another reads it back",
    () =>
      seedGrowth(260, 5).then(async (dir) => {
        const n = 260;
        const original = journalBytes(dir);
        const reference = await must(
          openFileCampaign(dir, optionsFor(policyAdmission(OLD_POLICY_ID).admission)),
        );
        const expected = await identity(reference, n);
        await reference.close();
        const script = join(import.meta.dirname, "fixtures", "policy-transition-process.ts");
        const run = () =>
          JSON.parse(
            execFileSync(
              process.execPath,
              [
                "--experimental-strip-types",
                "--no-warnings",
                script,
                dir,
                NEW_POLICY_ID,
                String(n),
              ],
              { encoding: "utf8" },
            ),
          ) as Record<string, any>;
        const first = run();
        expect(first).toMatchObject({ replayed: n, exact: n, mismatches: 0, judged: n });
        expect(first.head).toEqual(expected.head);
        expect(first.receipts).toEqual(expected.receipts);
        const second = run();
        expect(second).toMatchObject({ replayed: 0, exact: n, mismatches: 0, judged: 0 });
        expect(second.head).toEqual(expected.head);
        expect(journalBytes(dir).equals(original)).toBe(true);
        expect(readdirSync(dir)).not.toContain("LOCK");
      }),
    180_000,
  );
});

describe("H-07 S3 with the real canonical owners and the declared pre-v0.9 Runtime Contract", () => {
  const OLD_CONTRACT = "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd";
  const legacySpec = {
    ...BUILD_SPEC_IDENTITY,
    snapshot_files: {
      ...BUILD_SPEC_IDENTITY.snapshot_files,
      [RUNTIME_CONTRACT_SNAPSHOT]: OLD_CONTRACT,
    },
  };
  const factsOf = (c: CanonicalCampaign) =>
    canonicalJson(c.store.listFacts().map((f) => [f.key, f.version, f.value]));
  function countCanonical() {
    const original = canonicalAdmission.verifyHistorical!;
    let n = 0;
    (canonicalAdmission as any).verifyHistorical = (g: any, s: any) => (
      n++,
      original.call(canonicalAdmission, g, s)
    );
    return {
      count: () => n,
      restore: () => ((canonicalAdmission as any).verifyHistorical = original),
    };
  }

  it.each([103, 503])(
    "a %i-entry canonical package (state and history grow): one pass, identical receipt digests, owner checks, a real commit, strict audit",
    async (entries) => {
      const dir = tempDir();
      const created = await must(
        CanonicalCampaign.create(dir, {
          campaignId: "campaign-s3-canonical",
          specIdentity: legacySpec,
          fs: seedFs,
        }),
      );
      await must(created.establishWorld({ ...publication(1), world: fixtureWorld() }));
      await must(created.establishLocus({ ...publication(2), locus: fixtureLocus() }));
      await must(created.establishSourceCondition({ ...publication(3), source: sourceInput() }));
      for (let i = 0; i < entries - 3; i++)
        await must(
          created.establishSourceCondition({
            ...publication(10 + i),
            source: sourceInput({ source_key: `s3-source-${i}` }),
          }),
        );
      const expectedFacts = factsOf(created);
      expect(created.store.head().journal_entries).toBe(entries);
      await created.close();
      const original = journalBytes(dir);
      const recorded = journalEntries(dir);
      expect(manifestOf(dir).head.checkpoint.verification_policy).not.toContain("LEGACY");

      const counter = countCanonical();
      try {
        const spied = await spyOnDigest(() =>
          countReplays(() => must(CanonicalCampaign.open(dir))),
        );
        const opened = spied.result;
        expect(opened.entries).toBe(entries);
        expect(opened.cores).toBe(1);
        expect(counter.count()).toBe(entries);
        expect(spied.results).toEqual(recorded.map((e) => e.receipt.state_sha256));
        expect(spied.instances).toHaveLength(1);
        expect(spied.instances[0]!.stats).toEqual({ digests: entries, rebuilds: 1, fallbacks: 0 });
        const sampled = sampledRevisions(entries);
        for (const [revision, digest] of oracleStateDigests(original.toString("utf8"), sampled))
          expect(digest, `revision ${revision}`).toBe(recorded[revision - 1]!.receipt.state_sha256);
        expect(factsOf(opened.result)).toBe(expectedFacts);
        expect(opened.result.verify()).toEqual([]);
        expect(journalBytes(dir).equals(original)).toBe(true);
        expect(manifestOf(dir).head.checkpoint.verification_policy).toContain(
          "LEGACY-PRE-V9-RUNTIME-CONTRACT",
        );
        const added = await opened.result.establishSourceCondition({
          ...publication(9000),
          source: sourceInput({ source_key: "s3-after-transition" }),
        });
        expect(added.ok && added.value.replayed).toBe(false);
        await opened.result.close();
        const audited = await must(CanonicalCampaign.open(dir, { audit: true }));
        expect(audited.verify()).toEqual([]);
        expect(audited.store.listFacts()).toHaveLength(entries + 1);
        await audited.close();
      } finally {
        counter.restore();
      }
    },
    600_000,
  );
});

describe("H-07 S3 falsifying negatives: a changed history is neither trusted nor published", () => {
  const N = 220;
  let base: string;
  const baseDir = async () => (base ??= await seedGrowth(N, 21));
  const fresh = async () => copyDir(await baseDir());

  /** Rewrites journal line `k` (1-based), optionally re-sealing that entry's own hash so ONLY the recomputed receipt can disagree. */
  function tamper(dir: string, k: number, mutate: (entry: any) => void, reseal: boolean) {
    const path = join(dir, "journal.jsonl");
    const before = readFileSync(path, "utf8");
    const lines = before.split("\n");
    const entry = JSON.parse(lines[k - 1]!);
    mutate(entry);
    if (reseal) {
      const { entry_sha256: old, ...rest } = entry;
      void old;
      entry.entry_sha256 = entryHash(rest);
    }
    lines[k - 1] = canonicalJson(entry);
    const after = lines.join("\n");
    expect(Buffer.byteLength(after)).toBe(Buffer.byteLength(before)); // the committed length is unchanged: only content differs
    writeFileSync(path, after);
  }
  const flipHex = (hex: string) => `${hex[0] === "0" ? "1" : "0"}${hex.slice(1)}`;
  const flipLastDigit = (n: number) => (n % 10 === 0 ? n + 1 : n - 1);

  async function refusedUnchanged(dir: string) {
    const before = snapshotDir(dir);
    const r = await openNew(dir);
    expect(r.ok).toBe(false);
    expect(snapshotDir(dir)).toEqual(before);
    expect(readdirSync(dir)).not.toContain("LOCK");
    expect(manifestOf(dir).head.checkpoint.verification_policy).toBe(OLD_POLICY_ID);
    return r.ok ? ("OK" as const) : r.error;
  }

  it.each([2, 60, 129, 218])(
    "an altered receipt state_sha256 in entry %i (its own hash re-sealed) is refused, nothing is published",
    async (k) => {
      const dir = await fresh();
      tamper(dir, k, (e) => (e.receipt.state_sha256 = flipHex(e.receipt.state_sha256)), true);
      const refused = await refusedUnchanged(dir);
      expect(refused).toMatchObject({
        code: "REPLAY_MISMATCH",
        message: "recomputed entry differs",
        details: { revision: k },
      });
    },
  );

  it.each([3, 95, 190])(
    "a changed committed fact value in entry %i (hash re-sealed, receipt left as recorded) is refused, nothing is published",
    async (k) => {
      const dir = await fresh();
      tamper(
        dir,
        k,
        (e) => (e.group.writes[0].value.nest.b = flipLastDigit(e.group.writes[0].value.nest.b)),
        true,
      );
      const refused = await refusedUnchanged(dir);
      expect(refused).toMatchObject({
        code: "REPLAY_MISMATCH",
        message: "recomputed entry differs",
        details: { revision: k },
      });
    },
  );

  it("a changed value WITHOUT re-sealing the entry is refused as a content mismatch", async () => {
    const dir = await fresh();
    tamper(
      dir,
      77,
      (e) => (e.group.writes[0].value.nest.a = [flipLastDigit(e.group.writes[0].value.nest.a[0])]),
      false,
    );
    expect(await refusedUnchanged(dir)).toMatchObject({
      code: "REPLAY_MISMATCH",
      message: "entry hash does not match content",
    });
  });

  it("a group re-sealed to claim a fact for another owner is refused as an invalid transition, nothing is published", async () => {
    const dir = await fresh();
    tamper(dir, 100, (e) => (e.group.writes[0].owner = "TEST-OWNER-B"), true);
    expect(await refusedUnchanged(dir)).toMatchObject({
      code: "REPLAY_MISMATCH",
      details: { revision: 100 },
    });
  });

  it("a reordered or duplicated journal line is refused", async () => {
    const dir = await fresh();
    const path = join(dir, "journal.jsonl");
    const lines = readFileSync(path, "utf8").split("\n");
    [lines[40], lines[41]] = [lines[41]!, lines[40]!];
    writeFileSync(path, lines.join("\n"));
    expect(await refusedUnchanged(dir)).toMatchObject({ code: "REPLAY_MISMATCH" });
  });

  it("a checkpoint snapshot whose facts disagree with its recorded digest, or hold a fact twice, is refused", async () => {
    const changed = await fresh();
    const file = join(changed, manifestOf(changed).head.state_file);
    const state = JSON.parse(readFileSync(file, "utf8"));
    state.facts[3].value = { tampered: true };
    writeFileSync(file, `${canonicalJson(state)}\n`);
    expect(await refusedUnchanged(changed)).toMatchObject({ code: "INTEGRITY_STATE" });

    const duplicated = await fresh();
    const dupFile = join(duplicated, manifestOf(duplicated).head.state_file);
    const dup = JSON.parse(readFileSync(dupFile, "utf8"));
    dup.facts.push(dup.facts[0]);
    writeFileSync(dupFile, `${canonicalJson(dup)}\n`);
    expect(await refusedUnchanged(duplicated)).toMatchObject({ code: "INTEGRITY_STATE" });
  });

  it("a corrupted COLD entry is invisible to an ordinary cached open but is found by the transition", async () => {
    const dir = await fresh();
    tamper(dir, 11, (e) => (e.receipt.state_sha256 = flipHex(e.receipt.state_sha256)), true);
    const ordinary = await must(
      openFileCampaign(dir, optionsFor(policyAdmission(OLD_POLICY_ID).admission)),
    );
    expect(ordinary.head().revision).toBe(N); // the documented cold-prefix limitation of the ordinary open
    await ordinary.close();
    expect(await refusedUnchanged(dir)).toMatchObject({ code: "REPLAY_MISMATCH" });
  });

  it("an untrusted policy and an incompatible Runtime Contract are still refused or never anchored", async () => {
    const dir = await fresh();
    const before = manifestBytes(dir);
    const counting = policyAdmission(undefined);
    const opened = await countReplays(() =>
      must(openFileCampaign(dir, optionsFor(counting.admission))),
    );
    expect(opened.entries).toBe(N);
    await opened.result.close();
    expect(manifestBytes(dir).equals(before)).toBe(true);
    const incompatible = await countReplays(() =>
      openFileCampaign(
        dir,
        optionsFor(policyAdmission(NEW_POLICY_ID).admission, {
          compatibleRuntimeContracts: ["f".repeat(64)],
        }),
      ),
    );
    expect(!incompatible.result.ok && incompatible.result.error.code).toBe(
      "RUNTIME_CONTRACT_INCOMPATIBLE",
    );
    expect(incompatible.entries).toBe(0);
  });

  it("lost writer authority before publication refuses the open and leaves the old manifest authoritative", async () => {
    const dir = await fresh();
    const manifest = manifestBytes(dir);
    const foreign = JSON.stringify({
      nonce: "11111111-1111-1111-1111-111111111111",
      pid: process.pid,
    });
    const fs: FsOps = {
      ...nodeFs,
      async writeFileDurable(path, data) {
        await nodeFs.writeFileDurable(path, data);
        if (path.endsWith(`state.${String(N).padStart(10, "0")}.json`))
          writeFileSync(join(dir, "LOCK"), foreign);
      },
    };
    const r = await openNew(dir, { fs });
    expect(r.ok).toBe(false);
    expect(manifestBytes(dir).equals(manifest)).toBe(true);
    expect(readFileSync(join(dir, "LOCK"), "utf8")).toBe(foreign);
  });
});

describe("H-07 S3 interruption and recovery over growing and rewritten state", () => {
  for (const [name, seed, n] of [
    ["growing state", () => seedGrowth(130, 9), 130],
    ["late rewrites of existing facts", () => seedShape("late", 70, 60), 130],
    ["early rewrites of existing facts", () => seedShape("early", 70, 60), 130],
  ] as const) {
    it(`${name}: a crash before/after each durable step leaves the old or the verified new manifest, then converges byte-for-byte`, async () => {
      const base = await seed();
      const original = journalBytes(base);
      const priorManifest = manifestBytes(base);
      const referenceDir = copyDir(base);
      const probe = instrumentFs(nodeFs);
      const reference = await must(openNew(referenceDir, { fs: probe.fs }));
      const expected = await identity(reference, n);
      await reference.close();
      const steps = probe.count();
      const converged = snapshotDir(referenceDir);
      expect(steps).toBeGreaterThanOrEqual(7);
      for (let failAt = 1; failAt <= steps; failAt++)
        for (const when of ["before", "after"] as const) {
          const dir = copyDir(base);
          const inst = instrumentFs(nodeFs, { failAt, when });
          try {
            const attempt = await openNew(dir, { fs: inst.fs });
            if (attempt.ok) await attempt.value.close();
          } catch {
            // an injected crash that escaped the loader is still a crash
          }
          removeLockArtifacts(dir);
          const onDisk = manifestBytes(dir);
          if (!onDisk.equals(priorManifest)) {
            const m = manifestOf(dir);
            expect(m.head.checkpoint.verification_policy).toBe(NEW_POLICY_ID);
            expect(existsSync(join(dir, m.head.state_file))).toBe(true);
            expect(onDisk.equals(manifestBytes(referenceDir))).toBe(true);
          }
          const restored = await must(
            openFileCampaign(dir, optionsFor(policyAdmission(NEW_POLICY_ID).admission)),
          );
          expect(await identity(restored, n)).toEqual(expected);
          expect(restored.residue.other_files).toEqual([]);
          // the original last intent is reconciled by immutable identity, with no repeated effect
          const again = await must(restored.commit(journalEntries(base)[n - 1]!.group));
          expect(again).toEqual({ receipt: expected.receipts[2], replayed: true });
          await restored.close();
          expect(journalBytes(dir).equals(original)).toBe(true);
          expect(snapshotDir(dir)).toEqual(converged);
        }
    }, 600_000);
  }

  it("two concurrent recoveries of a crashed transition: one holds the lock, the other is refused, and both leave one verified successor", async () => {
    const n = 150;
    const base = await seedGrowth(n, 13);
    const original = journalBytes(base);
    const referenceDir = copyDir(base);
    const reference = await must(openNew(referenceDir));
    const expected = await identity(reference, n);
    await reference.close();
    const converged = snapshotDir(referenceDir);

    const dir = copyDir(base);
    const crash: FsOps = {
      ...nodeFs,
      async writeFileDurable(path, data) {
        if (path.endsWith("/manifest.json")) throw new Error("simulated crash before publication");
        return nodeFs.writeFileDurable(path, data);
      },
    };
    await openNew(dir, { fs: crash }).catch(() => undefined);
    removeLockArtifacts(dir);
    expect(manifestOf(dir).head.checkpoint.verification_policy).toBe(OLD_POLICY_ID);

    const [a, b] = await Promise.all([openNew(dir), openNew(dir)]);
    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(!losers[0]!.ok && losers[0]!.error.code).toBe("LOCKED");
    const winner = winners[0]!;
    if (!winner.ok) throw new Error("unreachable");
    expect(await identity(winner.value, n)).toEqual(expected);
    await winner.value.close();
    // after the winner is done, the loser's retry is an ordinary open and the bytes are exactly the converged successor
    const retry = await must(openNew(dir));
    expect(await identity(retry, n)).toEqual(expected);
    await retry.close();
    expect(journalBytes(dir).equals(original)).toBe(true);
    expect(snapshotDir(dir)).toEqual(converged);
  }, 120_000);
});
