/* eslint-disable @typescript-eslint/no-explicit-any -- tests craft raw journal bytes and patch the derived index to inject faults */
// H-07 S2 MECHANISM evidence (T1): the first open of a compatible v2 package whose history-verification policy differs from
// this build's. The strict historical replay runs ONCE per journal entry (it was four times), the derived successor is proved from
// durable files before one manifest publication, and every canonical result is byte-identical. Synthetic disposable packages only;
// no live campaign, host, model or provider. The matched before/after cost evidence is in docs/evidence/h07-s2-policy-transition-cost.md.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUILD_SPEC_IDENTITY,
  RUNTIME_CONTRACT_SNAPSHOT,
  canonicalJson,
  fail,
  ok,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  canonicalAdmission,
  createFileCampaign,
  nodeFs,
  openFileCampaign,
  sha256Canonical,
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
import { HistoryIndex } from "../../packages/engine/src/persistence/history-index.ts";
import {
  NEW_POLICY_ID,
  OLD_POLICY_ID,
  POLICY_CAMPAIGN as POLICY_CAMPAIGN_ID,
  change,
  countReplays,
  optionsFor,
  buildIndexTree,
  pathTo,
  policyAdmission,
  seedFs,
  seedOldPolicy,
  serializeIndexTree,
  walkIndexTree,
  type IndexTree,
} from "../support/policy-transition.ts";
import { must } from "../support/temporal.ts";
import { copyDir, snapshotDir, tempDir } from "../support/tmp.ts";

const manifestOf = (dir: string) =>
  CheckpointManifestSchema.parse(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")));
const manifestBytes = (dir: string) => readFileSync(join(dir, "manifest.json"));
const journalBytes = (dir: string) => readFileSync(join(dir, "journal.jsonl"));
const stateFiles = (dir: string) => readdirSync(dir).filter((f) => /^state\.\d+\.json$/.test(f));
const probes = (n: number) => [1, Math.ceil(n / 2), n];
const openNew = (dir: string, extra: FileCampaignOptions = {}) =>
  openFileCampaign(dir, optionsFor(policyAdmission(NEW_POLICY_ID).admission, extra));
const codeOfOpen = async (dir: string, extra: FileCampaignOptions = {}) => {
  const r = await openNew(dir, extra);
  if (r.ok) {
    await r.value.close();
    return "OK";
  }
  return r.error.code;
};
const removeLockArtifacts = (dir: string) => {
  for (const name of readdirSync(dir))
    if (name === "LOCK" || name.startsWith("LOCK.")) rmSync(join(dir, name));
};
const reseal = (dir: string, mutate: (m: ReturnType<typeof manifestOf>) => void) => {
  const m = manifestOf(dir);
  mutate(m);
  const { self_sha256: old, ...body } = m;
  void old;
  writeFileSync(
    join(dir, "manifest.json"),
    `${canonicalJson({ ...body, self_sha256: sha256Canonical(body) })}\n`,
  );
};

/** Everything that identifies the saved world: heads, facts and exact historical receipts/groups at probe points. */
async function identity(store: FileCampaignStore, n: number) {
  return {
    head: store.head(),
    facts: store.listFacts(),
    receipts: probes(n).map((i) => store.lookupReceipt(`intent-${i}`)),
    groups: probes(n).map((i) => store.committedGroupById?.(`group-${i}`) ?? null),
    byIntent: probes(n).map((i) => store.committedGroup(`intent-${i}`)),
  };
}

describe("H-07 S2: first open under a changed history-verification policy replays each entry once", () => {
  it.each([3, 103, 128, 503, 2003])(
    "%i-entry old-policy package: one strict pass, identical canonical results, a real future commit and exact lookups",
    async (n) => {
      const dir = await seedOldPolicy(n);
      const original = journalBytes(dir);
      const reference = await must(
        openFileCampaign(dir, optionsFor(policyAdmission(OLD_POLICY_ID).admission)),
      );
      const expected = await identity(reference, n);
      await reference.close();
      expect(manifestOf(dir).head.checkpoint.verification_policy).toBe(OLD_POLICY_ID);

      const counting = policyAdmission(NEW_POLICY_ID);
      const opened = await countReplays(() =>
        must(openFileCampaign(dir, optionsFor(counting.admission))),
      );
      const store = opened.result;
      // strict first trust is kept: every real historical group was judged by the CURRENT verifier... exactly once
      expect(opened.entries).toBe(n);
      expect(opened.cores).toBe(1);
      expect(counting.verified()).toBe(n);
      // canonical results are unchanged: same head, facts, receipts, groups, and the very same journal bytes
      expect(await identity(store, n)).toEqual(expected);
      expect(journalBytes(dir).equals(original)).toBe(true);
      const published = manifestOf(dir);
      expect(published.head.checkpoint).toMatchObject({
        verification_policy: NEW_POLICY_ID,
        revision: n,
        journal_entries: n,
        journal_bytes: original.length,
      });
      expect(published.head.checkpoint.index?.file).toContain(sha256Canonical(NEW_POLICY_ID));
      // one authoritative snapshot, no residue: the superseded checkpoint snapshot was removed after publication
      expect(stateFiles(dir)).toEqual([published.head.state_file]);
      expect(store.residue.other_files).toEqual([]);

      // a real post-transition commit continues the same chain, and the same intent is idempotent
      const next = await must(store.commit(change(n + 1)));
      expect(next.replayed).toBe(false);
      expect(next.receipt.revision).toBe(n + 1);
      expect(await must(store.commit(change(n + 1)))).toEqual({
        receipt: next.receipt,
        replayed: true,
      });
      expect(await store.commit({ ...change(n + 1), cause: "changed" })).toMatchObject({
        ok: false,
        error: { code: "INTENT_CONFLICT" },
      });
      await store.close();

      // cold reopen: the tail only (no second history pass), exact lookups across history, then strict audit
      const again = policyAdmission(NEW_POLICY_ID);
      const cold = await countReplays(() =>
        must(openFileCampaign(dir, optionsFor(again.admission))),
      );
      expect(cold.entries).toBe(1);
      expect(again.verified()).toBe(1);
      expect(cold.result.lookupReceipt(`intent-${n + 1}`)).toEqual(next.receipt);
      // exact historical lookups for EVERY identity, not a sample: receipt, group by id and group by intent
      for (let i = 1; i <= n + 1; i++) {
        expect(cold.result.lookupReceipt(`intent-${i}`)?.revision).toBe(i);
        expect(cold.result.committedGroupById!(`group-${i}`)).toEqual(change(i));
        expect(cold.result.committedGroup(`intent-${i}`)).toEqual(change(i));
      }
      for (const [k, i] of probes(n).entries())
        expect(cold.result.lookupReceipt(`intent-${i}`)).toEqual(expected.receipts[k]);
      await cold.result.close();
      const audit = await countReplays(() =>
        must(
          openFileCampaign(
            dir,
            optionsFor(policyAdmission(NEW_POLICY_ID).admission, { audit: true }),
          ),
        ),
      );
      expect(audit.entries).toBe(n + 1);
      await audit.result.close();
      expect(readdirSync(dir)).not.toContain("LOCK");
    },
    600_000,
  );

  it("an independent fresh process performs the transition, and another reads the result back", () => {
    const n = 140;
    return seedOldPolicy(n).then(async (dir) => {
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
            ["--experimental-strip-types", "--no-warnings", script, dir, NEW_POLICY_ID, String(n)],
            { encoding: "utf8" },
          ),
        ) as Record<string, any>;
      const first = run();
      expect(first.replayed).toBe(n);
      expect(first.exact).toBe(n);
      expect(first.mismatches).toBe(0);
      expect(first.judged).toBe(n);
      expect(first.head).toEqual(expected.head);
      expect(first.receipts).toEqual(expected.receipts);
      expect(first.groups).toEqual(expected.groups);
      const second = run(); // cold, in yet another process: bounded tail only
      expect(second.replayed).toBe(0);
      expect(second.exact).toBe(n);
      expect(second.mismatches).toBe(0);
      expect(second.judged).toBe(0);
      expect(second.head).toEqual(expected.head);
      expect(second.receipts).toEqual(expected.receipts);
      expect(second.residue.other_files).toEqual([]);
      expect(journalBytes(dir).equals(original)).toBe(true);
      expect(readdirSync(dir)).not.toContain("LOCK");
    });
  }, 120_000);

  it("a caller that itself asks for a strict audit still gets the audit, and the successor is published once", async () => {
    const n = 140;
    const dir = await seedOldPolicy(n);
    const counting = policyAdmission(NEW_POLICY_ID);
    const opened = await countReplays(() =>
      must(openFileCampaign(dir, optionsFor(counting.admission, { audit: true }))),
    );
    // the one policy-forced strict pass, plus the audit the caller explicitly requested of the published successor
    expect(opened.entries).toBe(2 * n);
    expect(manifestOf(dir).head.checkpoint.verification_policy).toBe(NEW_POLICY_ID);
    expect(opened.result.lookupReceipt("intent-1")?.revision).toBe(1);
    await opened.result.close();
  });
});

describe("H-07 S2 falsifying negatives: nothing is published, nothing is trusted", () => {
  const N = 200;
  let base: string;
  const baseDir = async () => (base ??= await seedOldPolicy(N));
  const fresh = async () => copyDir(await baseDir());

  /** Opens under the new policy and requires a refusal that leaves every byte of the package exactly as it was. */
  async function refusedUnchanged(
    dir: string,
    extra: FileCampaignOptions = {},
    admission = policyAdmission(NEW_POLICY_ID),
  ) {
    const before = snapshotDir(dir);
    const r = await openFileCampaign(dir, optionsFor(admission.admission, extra));
    expect(r.ok).toBe(false);
    expect(snapshotDir(dir)).toEqual(before);
    expect(readdirSync(dir)).not.toContain("LOCK");
    return r.ok ? "OK" : r.error.code;
  }
  async function oldPolicyStillOpens(dir: string) {
    const s = await must(
      openFileCampaign(dir, optionsFor(policyAdmission(OLD_POLICY_ID).admission)),
    );
    const revision = s.head().revision;
    await s.close();
    return revision;
  }

  it("a corrupted COLD historical journal entry is refused by the transition, though an ordinary cached open does not read it", async () => {
    const dir = await fresh();
    const path = join(dir, "journal.jsonl");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace('"cause":"cause-7"', '"cause":"CAUSE-7"'),
    );
    expect(await oldPolicyStillOpens(dir)).toBe(N); // documented cold-prefix limitation of the ordinary open
    expect(await refusedUnchanged(dir)).toBe("REPLAY_MISMATCH");
    expect(manifestOf(dir).head.checkpoint.verification_policy).toBe(OLD_POLICY_ID);
  });

  it("a broken hash chain in committed history is refused", async () => {
    const dir = await fresh();
    const path = join(dir, "journal.jsonl");
    const lines = readFileSync(path, "utf8").split("\n");
    const entry = JSON.parse(lines[41]!);
    entry.prev_sha256 = `${entry.prev_sha256.slice(0, 63)}${entry.prev_sha256.endsWith("0") ? "1" : "0"}`;
    lines[41] = canonicalJson(entry);
    writeFileSync(path, lines.join("\n"));
    expect(await refusedUnchanged(dir)).toMatch(/REPLAY_MISMATCH|INTEGRITY_JOURNAL/);
  });

  it("the CURRENT historical verifier is never bypassed: a group the old policy had accepted and flagged is rejected, stopping the open", async () => {
    const dir = await fresh();
    const rejecting = policyAdmission(NEW_POLICY_ID, (id) =>
      id === "group-150"
        ? { code: "VERSION_CONFLICT", message: "synthetic historical rejection" }
        : null,
    );
    expect(await refusedUnchanged(dir, {}, rejecting)).toBe("REPLAY_MISMATCH");
    expect(rejecting.verified()).toBe(150); // it judged groups 1..150 and stopped; nothing inherited the old policy's flags
    expect(manifestOf(dir).head.checkpoint.verification_policy).toBe(OLD_POLICY_ID);
    expect(await oldPolicyStillOpens(dir)).toBe(N);
  });

  it("owner validation of the hypothetical successor runs once, sees the fully replayed head, and a failure publishes nothing", async () => {
    const dir = await fresh();
    let calls = 0;
    const seen: number[] = [];
    const code = await refusedUnchanged(dir, {
      beforeMigrationCheck: (store) => {
        calls++;
        seen.push(store.head().revision);
        return fail("CANON_INTEGRITY", "synthetic owner violation");
      },
    });
    expect(code).toBe("CANON_INTEGRITY");
    expect(calls).toBe(1);
    expect(seen).toEqual([N]);
    // and with a passing validator the same open proceeds to publication
    let passed = 0;
    const s = await must(
      openNew(dir, {
        beforeMigrationCheck: () => {
          passed++;
          return ok(undefined);
        },
      }),
    );
    expect(passed).toBe(1);
    await s.close();
  });

  it("mismatched checkpoint state or head digest is refused", async () => {
    for (const mutate of [
      (dir: string) => writeFileSync(join(dir, manifestOf(dir).head.state_file), "{}"),
      (dir: string) =>
        reseal(dir, (m) => {
          m.head.state_sha256 = "d".repeat(64);
        }),
      (dir: string) =>
        reseal(dir, (m) => {
          m.head.checkpoint.state_sha256 = "c".repeat(64);
        }),
    ]) {
      const dir = await fresh();
      mutate(dir);
      expect(await refusedUnchanged(dir)).not.toBe("OK");
    }
  });

  it("a malformed, foreign or damaged OLD index is refused during the strict comparison", async () => {
    const damaged = await fresh();
    const ref = manifestOf(damaged).head.checkpoint.index!;
    const bytes = readFileSync(join(damaged, ref.file));
    bytes[ref.offset] = 32;
    writeFileSync(join(damaged, ref.file), bytes);
    expect(await refusedUnchanged(damaged)).toBe("INTEGRITY_JOURNAL");

    // evidence from a DIFFERENT campaign under the referenced name
    const foreign = tempDir();
    const other = await must(
      createFileCampaign(foreign, {
        campaignId: "foreign-campaign",
        ...optionsFor(policyAdmission(OLD_POLICY_ID).admission, { fs: seedFs }),
      }),
    );
    for (let i = 1; i <= 130; i++)
      await must(
        other.commit(
          group("foreign-campaign", i, [write("fact/x", i, { expected_version: i - 1 })]),
        ),
      );
    await other.close();
    const foreignRef = manifestOf(foreign).head.checkpoint.index!;
    const target = await fresh();
    const targetRef = manifestOf(target).head.checkpoint.index!;
    writeFileSync(join(target, targetRef.file), readFileSync(join(foreign, foreignRef.file)));
    expect(await refusedUnchanged(target)).toBe("INTEGRITY_JOURNAL");
  });

  it("an untrusted policy (no verifier identity) never publishes a trusted anchor and strictly replays every open", async () => {
    const dir = await fresh();
    const before = manifestBytes(dir);
    for (let round = 0; round < 2; round++) {
      const counting = policyAdmission(undefined);
      const opened = await countReplays(() =>
        must(openFileCampaign(dir, optionsFor(counting.admission))),
      );
      expect(opened.entries).toBe(N);
      await opened.result.close();
      expect(manifestBytes(dir).equals(before)).toBe(true);
    }
  });

  it("an incompatible Runtime Contract is refused before any replay", async () => {
    const dir = await fresh();
    const counting = policyAdmission(NEW_POLICY_ID);
    const r = await countReplays(() =>
      openFileCampaign(
        dir,
        optionsFor(counting.admission, { compatibleRuntimeContracts: ["f".repeat(64)] }),
      ),
    );
    expect(!r.result.ok && r.result.error.code).toBe("RUNTIME_CONTRACT_INCOMPATIBLE");
    expect(r.entries).toBe(0);
    expect(counting.verified()).toBe(0);
  });

  describe("the pre-publication successor proof is itself falsifiable", () => {
    const realExtend = HistoryIndex.prototype.extend;
    afterEach(() => {
      HistoryIndex.prototype.extend = realExtend;
    });
    const patchTransitionIndex = (mutate: (additions: [string, any][]) => [string, any][]) => {
      const generation = sha256Canonical(NEW_POLICY_ID);
      HistoryIndex.prototype.extend = function (this: HistoryIndex, root, additions, revision) {
        return realExtend.call(
          this,
          root,
          this.generation === generation ? mutate([...additions]) : additions,
          revision,
        );
      };
    };
    async function refusedBeforePublication(dir: string, extra: FileCampaignOptions = {}) {
      const manifest = manifestBytes(dir);
      const journal = journalBytes(dir);
      const oldSnapshot = manifestOf(dir).head.state_file;
      const r = await openNew(dir, extra);
      expect(r.ok).toBe(false);
      expect(manifestBytes(dir).equals(manifest)).toBe(true); // the old manifest is untouched: no partial authority
      expect(journalBytes(dir).equals(journal)).toBe(true);
      expect(existsSync(join(dir, oldSnapshot))).toBe(true); // and the old snapshot was NOT removed
      return r.ok ? "OK" : r.error.code;
    }

    /**
     * Replaces the transition's FINAL index batch with a durable tree built by hand: every node is referenced by its true SHA-256 and
     * the whole tree is one pack, so `shape` can break what a node-hash check cannot see (routing, uniqueness).
     */
    const injectDurableTree = (shape: (tree: IndexTree) => void) => {
      const generation = sha256Canonical(NEW_POLICY_ID);
      const all: [string, any][] = [];
      HistoryIndex.prototype.extend = async function (
        this: HistoryIndex,
        root,
        additions,
        revision,
      ) {
        if (this.generation !== generation) return realExtend.call(this, root, additions, revision);
        all.push(...additions);
        if (revision !== N) return realExtend.call(this, root, additions, revision);
        const tree = buildIndexTree(all);
        shape(tree);
        const file = `history/index.${String(revision).padStart(10, "0")}.${generation}.json`;
        const { root: ref, text } = serializeIndexTree(tree, file);
        await this.fs.writeFileDurable(join(this.dir, file), text);
        return ref;
      };
    };
    /** Every historical identity, resolved through the opened store's hash-directed lookups. */
    async function everyIdentityResolves(dir: string) {
      const s = await must(openNew(dir));
      for (let i = 1; i <= N; i++) {
        expect(s.lookupReceipt(`intent-${i}`)?.revision).toBe(i);
        expect(s.committedGroupById!(`group-${i}`)).toEqual(change(i));
      }
      await s.close();
    }

    it("control: a hand-built, correctly routed durable tree is accepted and resolves every identity", async () => {
      const dir = await fresh();
      injectDurableTree(() => undefined);
      await everyIdentityResolves(dir);
      expect(manifestOf(dir).head.checkpoint.verification_policy).toBe(NEW_POLICY_ID);
    });

    it("a digest-valid successor with a misrouted branch, the last intent still reachable, is refused before publication", async () => {
      const dir = await fresh();
      let swapped = "";
      injectDurableTree((tree) => {
        const onLastPath = new Set(pathTo(tree, `i:intent-${N}`));
        let victim: IndexTree | undefined;
        walkIndexTree(tree, (node) => {
          if (node.kind === "branch" && !onLastPath.has(node) && !victim) victim = node;
        });
        if (victim?.kind !== "branch")
          throw new Error("test construction found no branch to misroute");
        [victim.left, victim.right] = [victim.right, victim.left]; // every leaf survives; only the routing is wrong
        swapped = `bit ${victim.bit}`;
      });
      expect(await refusedBeforePublication(dir)).toBe("INTEGRITY_JOURNAL");
      expect(swapped).not.toBe("");
      HistoryIndex.prototype.extend = realExtend;
      await everyIdentityResolves(dir); // a clean same-PR retry converges and every identity is reachable
    });

    it("a digest-valid successor in which a duplicate leaf stands in for a missing identity is refused before publication", async () => {
      const dir = await fresh();
      let leaves = 0;
      injectDurableTree((tree) => {
        let stand: IndexTree | undefined;
        let replace:
          { parent: Extract<IndexTree, { kind: "branch" }>; side: "left" | "right" } | undefined;
        walkIndexTree(tree, (node, parent) => {
          if (node.kind !== "leaf") return;
          leaves++;
          if (node.key === "g:group-78") stand = node;
          if (node.key === "g:group-77" && parent?.kind === "branch")
            replace = { parent, side: parent.left === node ? "left" : "right" };
        });
        if (!stand || !replace) throw new Error("test construction found no leaf to duplicate");
        replace.parent[replace.side] = stand; // 2N leaves are still enumerated; g:group-77 is gone, g:group-78 appears twice
      });
      expect(await refusedBeforePublication(dir)).toBe("INTEGRITY_JOURNAL");
      expect(leaves).toBe(2 * N);
      HistoryIndex.prototype.extend = realExtend;
      await everyIdentityResolves(dir);
    });

    it("a successor index missing one historical identity is refused although every node is hash-valid", async () => {
      const dir = await fresh();
      patchTransitionIndex((a) => a.filter(([key]) => key !== "g:group-77"));
      expect(await refusedBeforePublication(dir)).toBe("INTEGRITY_JOURNAL");
      HistoryIndex.prototype.extend = realExtend;
      expect(await codeOfOpen(dir)).toBe("OK"); // a clean retry converges
    });

    it("a successor index that points two identities at each other's entries is refused", async () => {
      const dir = await fresh();
      patchTransitionIndex((a) => {
        const i = a.findIndex(([key]) => key === "i:intent-3");
        const j = a.findIndex(([key]) => key === "i:intent-4");
        if (i >= 0 && j >= 0)
          [a[i], a[j]] = [
            [a[i]![0], a[j]![1]],
            [a[j]![0], a[i]![1]],
          ];
        return a;
      });
      expect(await refusedBeforePublication(dir)).toBe("INTEGRITY_JOURNAL");
      HistoryIndex.prototype.extend = realExtend;
      expect(await codeOfOpen(dir)).toBe("OK");
    });

    it("a successor index that claims a location flagged unchecked as checked, or vice versa, is refused", async () => {
      const dir = await fresh();
      patchTransitionIndex((a) =>
        a.map(([key, loc]) =>
          key === "g:group-9" ? [key, { ...loc, checked: !loc.checked }] : [key, loc],
        ),
      );
      expect(await refusedBeforePublication(dir)).toBe("INTEGRITY_JOURNAL");
    });

    it("journal bytes that change after the strict replay and before publication are refused", async () => {
      const dir = await fresh();
      const journalPath = join(dir, "journal.jsonl");
      const total = manifestOf(dir).head.journal_bytes;
      let fullReads = 0;
      const fs: FsOps = {
        ...nodeFs,
        async readRange(path, offset, length) {
          const bytes = await nodeFs.readRange(path, offset, length);
          if (path === journalPath && offset === 0 && length === total && ++fullReads === 2) {
            const at = bytes.indexOf('"cause":"cause-20"');
            bytes[at + 9] = "C".charCodeAt(0);
          }
          return bytes;
        },
      };
      expect(await refusedBeforePublication(dir, { fs })).toBe("INTEGRITY_JOURNAL");
      expect(fullReads).toBe(2); // strict replay + the proof: one extra byte-read, never a second owner replay
    });

    it("a successor snapshot damaged on its way to disk is refused", async () => {
      const dir = await fresh();
      const fs: FsOps = {
        ...nodeFs,
        async writeFileDurable(path, data) {
          await nodeFs.writeFileDurable(path, data);
          if (path.endsWith(`state.${String(N).padStart(10, "0")}.json`))
            await nodeFs.writeFileDurable(path, "{}");
        },
      };
      expect(await refusedBeforePublication(dir, { fs })).not.toBe("OK");
    });

    it("lost writer authority before publication refuses the open and never removes the successor's lock", async () => {
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
});

describe("H-07 S2 interruption: every publication boundary converges to the same verified successor", () => {
  it("crash before/after each durable step of the transition leaves the old or the verified new manifest, then converges byte-for-byte", async () => {
    const n = 130;
    const base = await seedOldPolicy(n);
    const original = journalBytes(base);
    const priorManifest = manifestBytes(base);
    // the uninterrupted reference, and the number of mutating steps the transition performs
    const referenceDir = copyDir(base);
    const probe = instrumentFs(nodeFs);
    const reference = await must(openNew(referenceDir, { fs: probe.fs }));
    const expected = await identity(reference, n);
    await reference.close();
    const steps = probe.count(); // includes the lock release, so a crash can also land inside it
    const converged = snapshotDir(referenceDir);
    expect(steps).toBeGreaterThanOrEqual(7); // lock, three index packs, snapshot, manifest, cleanup

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
        // a dead process leaves its lock behind; the next process is the same pid here, so clear the lock family by hand
        removeLockArtifacts(dir);
        const onDisk = manifestBytes(dir);
        if (!onDisk.equals(priorManifest)) {
          // no partial authority: anything but the old manifest must be the complete, verified successor
          const m = manifestOf(dir);
          expect(m.head.checkpoint.verification_policy).toBe(NEW_POLICY_ID);
          expect(existsSync(join(dir, m.head.state_file))).toBe(true);
          expect(onDisk.equals(manifestBytes(referenceDir))).toBe(true);
        }
        const counting = policyAdmission(NEW_POLICY_ID);
        const restored = await must(openFileCampaign(dir, optionsFor(counting.admission)));
        expect(await identity(restored, n)).toEqual(expected);
        expect(restored.residue.other_files).toEqual([]);
        // the original intent's receipt is reconciled by immutable identity, with no repeated effect
        const again = await must(restored.commit(change(n)));
        expect(again).toEqual({ receipt: expected.receipts[2], replayed: true });
        await restored.close();
        expect(journalBytes(dir).equals(original)).toBe(true);
        expect(snapshotDir(dir)).toEqual(converged);
        expect(await codeOfOpen(dir, { audit: true })).toBe("OK");
      }
  }, 300_000);

  it("a crash between publication and cleanup of the superseded snapshot is repaired by the proved R-01 reconciliation, then clean", async () => {
    const n = 140;
    const dir = await seedOldPolicy(n);
    const prior = manifestOf(dir);
    const superseded = prior.head.state_file;
    const fs: FsOps = {
      ...nodeFs,
      async remove(path) {
        if (path === join(dir, superseded)) throw new Error("cleanup failed");
        await nodeFs.remove(path);
      },
    };
    // the failing cleanup is only best effort after publication; the reopen then finds the residue and proves it before removal
    const r = await openNew(dir, { fs });
    expect(r.ok).toBe(false); // R-01 refuses the open that cannot clean its residue; a fresh open retries
    removeLockArtifacts(dir);
    expect(manifestOf(dir).head.checkpoint.verification_policy).toBe(NEW_POLICY_ID);
    expect(existsSync(join(dir, superseded))).toBe(true);
    const counting = policyAdmission(NEW_POLICY_ID);
    const healed = await countReplays(() =>
      must(openFileCampaign(dir, optionsFor(counting.admission))),
    );
    expect(healed.result.residue.other_files).toEqual([]);
    expect(existsSync(join(dir, superseded))).toBe(false);
    expect(healed.entries).toBeGreaterThanOrEqual(n); // the exceptional, fully proved removal still costs a replay
    await healed.result.close();
  });

  /** After the successor manifest is durable, `tamper` rewrites the superseded snapshot; the transition must then not remove it. */
  async function supersededRewrittenAfterPublication(
    tamper: (path: string, original: Buffer) => string | Buffer,
  ) {
    const n = 140;
    const dir = await seedOldPolicy(n);
    const superseded = join(dir, manifestOf(dir).head.state_file);
    const original = readFileSync(superseded);
    const fs: FsOps = {
      ...nodeFs,
      async writeFileDurable(path, data) {
        await nodeFs.writeFileDurable(path, data);
        if (path === join(dir, "manifest.json"))
          writeFileSync(superseded, tamper(superseded, original));
      },
    };
    const opened = await countReplays(() => openNew(dir, { fs }));
    return { n, dir, superseded, opened };
  }

  it("a superseded snapshot whose bytes changed after they were verified is not removed by the transition; the proved reconciliation decides", async () => {
    // a whitespace-only rewrite is still the same state: the proved R-01 reconciliation (one more replay) removes it
    const { n, dir, superseded, opened } = await supersededRewrittenAfterPublication(
      (_p, original) => Buffer.concat([original, Buffer.from("\n")]),
    );
    expect(opened.result.ok).toBe(true);
    expect(opened.entries).toBe(2 * n); // the strict pass, plus the reconciliation's replay of the committed history
    expect(existsSync(superseded)).toBe(false);
    if (opened.result.ok) {
      expect(opened.result.value.residue.other_files).toEqual([]);
      await opened.result.value.close();
    }
    expect(manifestOf(dir).head.checkpoint.verification_policy).toBe(NEW_POLICY_ID);
  });

  it("an unprovable replacement of the superseded snapshot is never deleted: it stays reported residue and canon is untouched", async () => {
    const { dir, superseded, opened } = await supersededRewrittenAfterPublication(() =>
      JSON.stringify({ campaign_id: POLICY_CAMPAIGN_ID, revision: 1, facts: [] }),
    );
    expect(opened.result.ok).toBe(true);
    expect(existsSync(superseded)).toBe(true);
    if (opened.result.ok) {
      expect(opened.result.value.residue.other_files).toContain(superseded.slice(dir.length + 1));
      await opened.result.value.close();
    }
    expect(manifestOf(dir).head.checkpoint.verification_policy).toBe(NEW_POLICY_ID);
  });
});

describe("H-07 S2 with the real canonical owners and the declared pre-v0.9 Runtime Contract", () => {
  const OLD_CONTRACT = "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd";
  const LEGACY_FIXTURE = "tests/fixtures/legacy-base-eafbb127/package";

  /** counts the canonical historical verifier (the legacy admission delegates to it by property lookup at call time) */
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
  const factsOf = (c: CanonicalCampaign) =>
    canonicalJson(c.store.listFacts().map((f) => [f.key, f.version, f.value]));

  it("a package written by the exact prior base build: each of its groups is judged once (it was four times), owners verify, and the world is unchanged", async () => {
    const dir = tempDir();
    const { cpSync, mkdirSync } = await import("node:fs");
    cpSync(LEGACY_FIXTURE, dir, { recursive: true });
    mkdirSync(join(dir, "history"), { recursive: true });
    const before = journalBytes(dir);
    const counter = countCanonical();
    try {
      const opened = await countReplays(() => must(CanonicalCampaign.open(dir)));
      expect(opened.entries).toBe(3);
      expect(opened.cores).toBe(1);
      expect(counter.count()).toBe(3);
      expect(opened.result.verify()).toEqual([]);
      expect(opened.result.store.listFacts()).toHaveLength(3);
      expect(journalBytes(dir).equals(before)).toBe(true);
      expect(manifestOf(dir).compatibility.runtime_contract_sha256).toBe(OLD_CONTRACT);
      expect(manifestOf(dir).head.checkpoint.verification_policy).toContain(
        "LEGACY-PRE-V9-RUNTIME-CONTRACT",
      );
      await opened.result.close();
      const warm = await countReplays(() => must(CanonicalCampaign.open(dir)));
      expect(warm.entries).toBe(0);
      await warm.result.close();
    } finally {
      counter.restore();
    }
  });

  it("a larger legacy-contract package with real owners: one pass, identical facts, owner checks, a real commit, strict audit", async () => {
    const legacySpec = {
      ...BUILD_SPEC_IDENTITY,
      snapshot_files: {
        ...BUILD_SPEC_IDENTITY.snapshot_files,
        [RUNTIME_CONTRACT_SNAPSHOT]: OLD_CONTRACT,
      },
    };
    const dir = tempDir();
    const created = await must(
      CanonicalCampaign.create(dir, {
        campaignId: "campaign-s2-canonical",
        specIdentity: legacySpec,
        fs: seedFs,
      }),
    );
    await must(created.establishWorld({ ...publication(1), world: fixtureWorld() }));
    await must(created.establishLocus({ ...publication(2), locus: fixtureLocus() }));
    await must(created.establishSourceCondition({ ...publication(3), source: sourceInput() }));
    for (let i = 0; i < 130; i++)
      await must(
        created.establishSourceCondition({
          ...publication(10 + i),
          source: sourceInput({ source_key: `s2-source-${i}` }),
        }),
      );
    const expected = factsOf(created);
    const entries = created.store.head().journal_entries;
    await created.close();
    const original = journalBytes(dir);
    expect(manifestOf(dir).head.checkpoint.verification_policy).not.toContain("LEGACY");

    const counter = countCanonical();
    try {
      const opened = await countReplays(() => must(CanonicalCampaign.open(dir)));
      expect(opened.entries).toBe(entries);
      expect(opened.cores).toBe(1);
      expect(counter.count()).toBe(entries);
      expect(factsOf(opened.result)).toBe(expected);
      expect(opened.result.verify()).toEqual([]);
      expect(journalBytes(dir).equals(original)).toBe(true);
      expect(manifestOf(dir).head.checkpoint.verification_policy).toContain(
        "LEGACY-PRE-V9-RUNTIME-CONTRACT",
      );
      const added = await opened.result.establishSourceCondition({
        ...publication(9000),
        source: sourceInput({ source_key: "s2-after-transition" }),
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
  }, 120_000);
});
