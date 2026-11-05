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

// -- H-07 S3 fixtures: growing and adversarially rewritten state under an OLD policy -------------------------------------------------
// Both are written by the ordinary live commit path (so every receipt carries the reference full-state SHA-256) and closed cleanly.
export const SHAPES = ["early", "middle", "late", "rotate"] as const;
export type Shape = (typeof SHAPES)[number];
const pad6 = (i: number) => String(i).padStart(6, "0");

/** mulberry32: a small deterministic PRNG so every run builds the identical history. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const chained = (n: number) => (n > 1 ? { depends_on: [`group-${n - 1}`] } : {});

/**
 * `count` entries, each adding ONE new fact at a pseudo-random place of the key order: state and history grow together, and the
 * insertion point is anywhere (early, middle, late), so every length of unchanged canonical prefix occurs.
 */
export async function seedGrowth(count: number, seed = 1): Promise<string> {
  const dir = tempDir();
  const store = await must(
    createFileCampaign(dir, {
      campaignId: POLICY_CAMPAIGN,
      ...optionsFor(policyAdmission(OLD_POLICY_ID).admission, { fs: seedFs }),
    }),
  );
  const rand = prng(seed);
  const used = new Set<string>();
  for (let n = 1; n <= count; n++) {
    let key = `growth/${pad6(Math.floor(rand() * 1_000_000))}`;
    while (used.has(key)) key = `growth/${pad6(Math.floor(rand() * 1_000_000))}`;
    used.add(key);
    await must(
      store.commit(
        group(
          POLICY_CAMPAIGN,
          n,
          [write(key, { n, text: "é".repeat(Math.floor(rand() * 300)), nest: { b: n, a: [n] } })],
          chained(n),
        ),
      ),
    );
  }
  await store.close();
  return dir;
}

/** The key rewritten by update `u` of a shape: the first, middle or last key of `cold`, or a rotating one. */
export const shapeKey = (kind: Shape, cold: number, u: number) =>
  `shape/${pad6(
    kind === "early"
      ? 0
      : kind === "middle"
        ? Math.floor(cold / 2)
        : kind === "late"
          ? cold - 1
          : (u * 7919) % cold,
  )}`;

/**
 * `cold` padded facts (one per entry), then `updates` entries that each rewrite ONE EXISTING fact at the named position of the key
 * order: the state stays the same size while history grows, and the position decides how much of the canonical message precedes the
 * first changed byte (none for `early`, nearly all for `late`).
 */
export async function seedShape(kind: Shape, cold: number, updates: number): Promise<string> {
  const dir = tempDir();
  const store = await must(
    createFileCampaign(dir, {
      campaignId: POLICY_CAMPAIGN,
      ...optionsFor(policyAdmission(OLD_POLICY_ID).admission, { fs: seedFs }),
    }),
  );
  const versions = new Map<string, number>();
  const put = async (n: number, key: string, value: Parameters<typeof write>[1]) => {
    const expected = versions.get(key) ?? 0;
    await must(
      store.commit(
        group(POLICY_CAMPAIGN, n, [write(key, value, { expected_version: expected })], chained(n)),
      ),
    );
    versions.set(key, expected + 1);
  };
  for (let i = 0; i < cold; i++)
    await put(i + 1, `shape/${pad6(i)}`, { n: i, pad: "x".repeat(200) });
  for (let u = 1; u <= updates; u++)
    await put(cold + u, shapeKey(kind, cold, u), { n: u, pad: "y".repeat(200) });
  await store.close();
  return dir;
}

interface JournalLine {
  readonly revision: number;
  readonly group: {
    readonly campaign_id: string;
    readonly group_id: string;
    readonly intent_id: string;
    readonly cause: string;
    readonly rule: unknown;
    readonly writes: readonly {
      readonly key: string;
      readonly owner: string;
      readonly facet: string;
      readonly value: unknown;
      readonly unit: unknown;
      readonly basis: string;
      readonly secrecy: string;
    }[];
  };
}

/**
 * An independent definition of the receipt digest, sharing no code with CampaignCore: folds the journal's groups into facts,
 * and at each requested revision hashes the canonical JSON of the whole state exactly as the specification of `state_sha256` reads.
 */
export function oracleStateDigests(
  journalText: string,
  revisions: ReadonlySet<number> | "all",
): Map<number, string> {
  const facts = new Map<string, { key: string; version: number } & Record<string, unknown>>();
  const out = new Map<number, string>();
  let revision = 0;
  for (const line of journalText.split("\n")) {
    if (line === "") continue;
    const entry = JSON.parse(line) as JournalLine;
    const g = entry.group;
    for (const w of g.writes)
      facts.set(w.key, {
        key: w.key,
        owner: w.owner,
        facet: w.facet,
        value: w.value,
        unit: w.unit,
        basis: w.basis,
        secrecy: w.secrecy,
        version: (facts.get(w.key)?.version ?? 0) + 1,
        provenance: {
          group_id: g.group_id,
          intent_id: g.intent_id,
          cause: g.cause,
          rule: g.rule,
        },
      });
    revision++;
    if (revision !== entry.revision) throw new Error("oracle: journal is not consecutive");
    if (revisions === "all" || revisions.has(revision)) {
      const sorted = [...facts.values()].sort((a, b) =>
        a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
      );
      out.set(revision, sha256Canonical({ campaign_id: g.campaign_id, revision, facts: sorted }));
    }
  }
  return out;
}
