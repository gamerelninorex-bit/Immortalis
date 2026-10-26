/** Derived immutable path-copy index. It authenticates journal byte ranges, never world state.
 * A pack contains only the nodes created by one checkpoint (at most 128 insertions per namespace).
 * Ordinary open reads no historical registry. Lookups verify every consumed node and journal entry.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { canonicalJson, Sha256 } from "@immortalis/contracts";
import { sha256Canonical } from "../hash.ts";
import type { FsOps } from "./fs-ops.ts";

export const RefSchema = z.strictObject({
  file: z.string().regex(/^history\/index\.[0-9]{10}\.[0-9a-f]{64}\.json$/),
  offset: z.number().int().nonnegative(),
  length: z.number().int().positive(),
  sha256: Sha256,
});
export type IndexRef = z.infer<typeof RefSchema>;
export const LocationSchema = z.strictObject({
  offset: z.number().int().nonnegative(),
  length: z.number().int().positive(),
  sha256: Sha256,
  checked: z.boolean(),
  revision: z.number().int().positive(),
});
export type Location = z.infer<typeof LocationSchema>;
type Node =
  | { kind: "leaf"; key: string; value: Location }
  | { kind: "branch"; bit: number; left: IndexRef; right: IndexRef };
const NodeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("leaf"), key: z.string(), value: LocationSchema }),
  z.strictObject({
    kind: z.literal("branch"),
    bit: z.number().int().min(0).max(255),
    left: RefSchema,
    right: RefSchema,
  }),
]);
const digest = (key: string) => createHash("sha256").update(key).digest();
const bitAt = (bytes: Buffer, bit: number) => (bytes[bit >> 3]! >> (7 - (bit & 7))) & 1;

export class HistoryIndex {
  readonly dir: string;
  readonly fs: FsOps;
  readonly generation: string;
  constructor(dir: string, fs: FsOps, generation = sha256Canonical("structural-v1")) {
    this.dir = dir;
    this.fs = fs;
    this.generation = generation;
  }
  read(ref: IndexRef): Node {
    const raw: unknown = JSON.parse(
      this.fs.readRangeSync(join(this.dir, ref.file), ref.offset, ref.length).toString("utf8"),
    );
    const node = NodeSchema.parse(raw);
    if (sha256Canonical(node) !== ref.sha256) throw new Error("history index hash mismatch");
    return node;
  }
  lookup(root: IndexRef | null, key: string): Location | null {
    const hash = digest(key);
    let ref = root;
    let last = -1;
    while (ref) {
      const node = this.read(ref);
      if (node.kind === "leaf") return node.key === key ? node.value : null;
      if (node.bit <= last) throw new Error("unordered history index");
      last = node.bit;
      ref = bitAt(hash, node.bit) ? node.right : node.left;
    }
    return null;
  }
  *entries(root: IndexRef | null): Generator<[string, Location]> {
    if (!root) return;
    const stack: [IndexRef, number][] = [[root, -1]];
    while (stack.length) {
      const [ref, bit] = stack.pop()!;
      const n = this.read(ref);
      if (n.kind === "leaf") yield [n.key, n.value];
      else {
        if (n.bit <= bit) throw new Error("unordered history index");
        stack.push([n.right, n.bit], [n.left, n.bit]);
      }
    }
  }
  /** One bounded batch, published before its checkpoint/head. Existing packs are immutable. */
  async extend(
    root: IndexRef | null,
    additions: readonly [string, Location][],
    revision: number,
  ): Promise<IndexRef | null> {
    if (!additions.length) return root;
    const file = `history/index.${String(revision).padStart(10, "0")}.${this.generation}.json`;
    const nodes = new Map<number, Node>();
    const lines: string[] = [];
    let offset = 0;
    const make = (node: Node): IndexRef => {
      const line = `${canonicalJson(node)}\n`;
      const ref = { file, offset, length: Buffer.byteLength(line), sha256: sha256Canonical(node) };
      nodes.set(offset, node);
      lines.push(line);
      offset += ref.length;
      return ref;
    };
    const read = (r: IndexRef) => (r.file === file ? nodes.get(r.offset)! : this.read(r));
    const insert = (ref: IndexRef | null, key: string, value: Location): IndexRef => {
      const hash = digest(key);
      if (!ref) return make({ kind: "leaf", key, value });
      let leaf = read(ref);
      while (leaf.kind === "branch") leaf = read(bitAt(hash, leaf.bit) ? leaf.right : leaf.left);
      if (leaf.key === key) throw new Error("duplicate historical identity");
      const other = digest(leaf.key);
      let split = 0;
      while (split < 256 && bitAt(hash, split) === bitAt(other, split)) split++;
      if (split === 256) throw new Error("historical index digest collision");
      const add = (at: IndexRef): IndexRef => {
        const n = read(at);
        if (n.kind === "branch" && n.bit < split) {
          return make(
            bitAt(hash, n.bit) ? { ...n, right: add(n.right) } : { ...n, left: add(n.left) },
          );
        }
        const fresh = make({ kind: "leaf", key, value });
        return make(
          bitAt(hash, split)
            ? { kind: "branch", bit: split, left: at, right: fresh }
            : { kind: "branch", bit: split, left: fresh, right: at },
        );
      };
      return add(ref);
    };
    for (const [key, value] of additions) root = insert(root, key, value);
    await this.fs.writeFileDurable(join(this.dir, file), lines.join(""));
    return root;
  }
}
