// H-07 S2 MECHANISM test support: a v2 package written under an OLDER history-verification policy, reopened by a build whose
// policy differs. Synthetic disposable data only; no real campaign, host, model or provider is involved.
import { createHash } from "node:crypto";
import { appendFile, rename, writeFile } from "node:fs/promises";
import { canonicalJson } from "@immortalis/contracts";
import {
  CampaignCore,
  createFileCampaign,
  nodeFs,
  sha256Canonical,
  type FileCampaignOptions,
  type FsOps,
  type WriteAdmission,
} from "@immortalis/engine";
import { TEST_OWNERS, group, write } from "@immortalis/testkit";
import type { IndexRef, Location } from "../../packages/engine/src/persistence/history-index.ts";
import { must } from "./temporal.ts";
import { tempDir } from "./tmp.ts";

export const POLICY_CAMPAIGN = "h07-s2-policy-transition";
export const OLD_POLICY_ID = "h07-s2-old-policy";
export const NEW_POLICY_ID = "h07-s2-new-policy";

/** The n-th commit of a one-fact history: unrelated history length varies, the causal fact stays one. */
export const change = (n: number) =>
  group(
    POLICY_CAMPAIGN,
    n,
    [write("fact/a", n, { expected_version: n - 1 })],
    n > 1 ? { depends_on: [`group-${n - 1}`] } : {},
  );

export interface CountingAdmission {
  readonly admission: WriteAdmission;
  /** groups the historical verifier was actually asked to judge */
  readonly verified: () => number;
}

/** A pure admission under a named history-verification policy that counts every historical judgement. */
export function policyAdmission(
  id: string | undefined,
  verdict: (groupId: string) => { code: "VERSION_CONFLICT"; message: string } | null = () => null,
): CountingAdmission {
  let verified = 0;
  const admission: WriteAdmission = {
    ...(id === undefined ? {} : { historyVerificationId: id }),
    check: () => null,
    verifyHistorical: (g) => {
      verified++;
      return verdict(g.group_id);
    },
  };
  return { admission, verified: () => verified };
}

export const optionsFor = (admission: WriteAdmission, extra: FileCampaignOptions = {}) => ({
  owners: TEST_OWNERS,
  admission,
  ...extra,
});

/**
 * Fixture SEEDING only: the same bytes as the production file seam, without the per-write fsync. A seeded package is closed cleanly
 * before it is used, so only crash durability differs, and thousands of fsyncs would otherwise load a shared CI disk and slow
 * unrelated suites. Every operation UNDER TEST (the transition, its faults, recovery) still uses the production `nodeFs`.
 */
export const seedFs: FsOps = {
  ...nodeFs,
  writeFileDurable: async (path, data) => {
    const tmp = `${path}.tmp`;
    await writeFile(tmp, data, "utf8");
    await rename(tmp, path);
  },
  appendDurable: (path, data) => appendFile(path, data, "utf8"),
};

/** A closed package of `count` entries written under the OLD policy (every group judged by it at commit). */
export async function seedOldPolicy(count: number): Promise<string> {
  const dir = tempDir();
  const store = await must(
    createFileCampaign(dir, {
      campaignId: POLICY_CAMPAIGN,
      ...optionsFor(policyAdmission(OLD_POLICY_ID).admission, { fs: seedFs }),
    }),
  );
  for (let n = 1; n <= count; n++) await must(store.commit(change(n)));
  await store.close();
  return dir;
}

/** Counts strict-replay entries (CampaignCore.replay calls) and the distinct cores that replayed, around one async action. */
export async function countReplays<T>(
  action: () => Promise<T>,
): Promise<{ result: T; entries: number; cores: number }> {
  const original = CampaignCore.prototype.replay;
  const perCore = new Map<unknown, number>();
  CampaignCore.prototype.replay = function (this: CampaignCore, ...args) {
    perCore.set(this, (perCore.get(this) ?? 0) + 1);
    return original.apply(this, args);
  };
  try {
    const result = await action();
    return {
      result,
      entries: [...perCore.values()].reduce((a, b) => a + b, 0),
      cores: perCore.size,
    };
  } finally {
    CampaignCore.prototype.replay = original;
  }
}

// -- digest-valid derived index trees ------------------------------------------------------------------------------------------------
// The successor proof must not trust "every node hashes correctly": a tree whose every node is hash-valid can still route a key to
// the wrong place, repeat a leaf, or omit an identity. These helpers build such durable, hash-valid trees on purpose.
export type IndexTree =
  | { kind: "leaf"; key: string; value: Location }
  | { kind: "branch"; bit: number; left: IndexTree; right: IndexTree };
const digestOf = (key: string) => createHash("sha256").update(canonicalJson(key)).digest();
const bitAt = (bytes: Buffer, bit: number) => (bytes[bit >> 3]! >> (7 - (bit & 7))) & 1;

/** The canonical compressed binary trie over the SHA-256 path of each key: what `HistoryIndex.lookup` routes through. */
export function buildIndexTree(items: readonly (readonly [string, Location])[]): IndexTree {
  const hashed = items.map(([key, value]) => ({ key, value, hash: digestOf(key) }));
  const grow = (set: typeof hashed, from: number): IndexTree => {
    if (set.length === 1) return { kind: "leaf", key: set[0]!.key, value: set[0]!.value };
    let bit = from;
    while (set.every((x) => bitAt(x.hash, bit) === bitAt(set[0]!.hash, bit))) bit++;
    return {
      kind: "branch",
      bit,
      left: grow(
        set.filter((x) => bitAt(x.hash, bit) === 0),
        bit + 1,
      ),
      right: grow(
        set.filter((x) => bitAt(x.hash, bit) === 1),
        bit + 1,
      ),
    };
  };
  return grow(hashed, 0);
}

/** One pack holding the whole tree, every node referenced by its true SHA-256 (children before parents). */
export function serializeIndexTree(
  tree: IndexTree,
  file: string,
): { root: IndexRef; text: string } {
  const lines: string[] = [];
  let offset = 0;
  const emit = (node: IndexTree): IndexRef => {
    const stored =
      node.kind === "leaf"
        ? node
        : {
            kind: "branch" as const,
            bit: node.bit,
            left: emit(node.left),
            right: emit(node.right),
          };
    const line = `${canonicalJson(stored)}\n`;
    const ref = { file, offset, length: Buffer.byteLength(line), sha256: sha256Canonical(stored) };
    lines.push(line);
    offset += ref.length;
    return ref;
  };
  const root = emit(tree);
  return { root, text: lines.join("") };
}

/** Every node on the way from the root to the leaf of `key`, root first. */
export function pathTo(tree: IndexTree, key: string): IndexTree[] {
  const hash = digestOf(key);
  const path: IndexTree[] = [];
  for (let node: IndexTree = tree; ;) {
    path.push(node);
    if (node.kind === "leaf") return path;
    node = bitAt(hash, node.bit) ? node.right : node.left;
  }
}

/** All branch nodes and all leaves, depth first. */
export function walkIndexTree(
  tree: IndexTree,
  visit: (node: IndexTree, parent: IndexTree | null) => void,
) {
  const go = (node: IndexTree, parent: IndexTree | null) => {
    visit(node, parent);
    if (node.kind === "branch") {
      go(node.left, node);
      go(node.right, node);
    }
  };
  go(tree, null);
}
